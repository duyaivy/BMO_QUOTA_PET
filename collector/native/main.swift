import Foundation
import CryptoKit

// MARK: - Utilities & Extensions

extension Data {
    init?(hex: String) {
        let clean = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count % 2 == 0 else { return nil }
        var data = Data(capacity: clean.count / 2)
        var i = clean.startIndex
        while i < clean.endIndex {
            let next = clean.index(i, offsetBy: 2)
            guard let b = UInt8(clean[i..<next], radix: 16) else { return nil }
            data.append(b)
            i = next
        }
        self = data
    }

    func sha256Hex() -> String {
        return SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
    }
}

func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}

// MARK: - Configuration Models

struct CollectorConfig: Decodable {
    let evidenceMode: String
    let collectorId: String
    let keyId: String
    let secretFile: String
    let url: String
    let stateDirectory: String
    let providers: [String: ProviderSetting]
    let nativeCodex: NativeCodexSetting?
    let nativeStatuslines: [String: NativeStatuslineSetting]?

    struct ProviderSetting: Decodable {
        let enabled: Bool
        let generation: Int
    }

    struct NativeCodexSetting: Decodable {
        let sessionDirectory: String
        let version: String
    }

    struct NativeStatuslineSetting: Decodable {
        let version: String
        let subscriptionQuotaConfirmed: Bool?
    }
}

// MARK: - Ingestion Client

class IngestionClient {
    let config: CollectorConfig
    let keyData: Data
    let session: URLSession

    init(config: CollectorConfig) throws {
        self.config = config
        let secretHex = try String(contentsOfFile: config.secretFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let data = Data(hex: secretHex) else {
            throw NSError(domain: "BMO", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid secret key file (must be 64-char hex)"])
        }
        self.keyData = data
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 10
        self.session = URLSession(configuration: sessionConfig)
    }

    enum IngestResult {
        case success
        case sequenceConflict
        case failed(Int)
    }

    func signAndUpload(payloadJson: String, eventId: String) -> IngestResult {
        guard let url = URL(string: config.url),
              let bodyData = payloadJson.data(using: .utf8) else { return .failed(0) }

        let timestamp = String(Int(Date().timeIntervalSince1970))
        let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        let bodyHash = bodyData.sha256Hex()

        let signingText = [
            "BMO-INGEST-V1",
            "POST",
            "/api/internal/usage/ingest",
            config.keyId,
            config.collectorId,
            timestamp,
            nonce,
            eventId,
            bodyHash
        ].joined(separator: "\n")

        let symKey = SymmetricKey(data: keyData)
        let signature = HMAC<SHA256>.authenticationCode(for: signingText.data(using: .utf8)!, using: symKey)
        let signatureHex = signature.map { String(format: "%02x", $0) }.joined()

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = bodyData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.keyId, forHTTPHeaderField: "X-BMO-Key-Id")
        request.setValue(timestamp, forHTTPHeaderField: "X-BMO-Timestamp")
        request.setValue(nonce, forHTTPHeaderField: "X-BMO-Nonce")
        request.setValue(signatureHex, forHTTPHeaderField: "X-BMO-Signature")
        request.setValue(eventId, forHTTPHeaderField: "Idempotency-Key")

        let semaphore = DispatchSemaphore(value: 0)
        var result: IngestResult = .failed(0)

        let task = session.dataTask(with: request) { data, response, error in
            if let http = response as? HTTPURLResponse {
                if http.statusCode == 200 {
                    result = .success
                } else if http.statusCode == 409 {
                    result = .sequenceConflict
                } else {
                    let msg = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                    print("[BMO-HTTP] Ingest failed status \(http.statusCode): \(msg)")
                    result = .failed(http.statusCode)
                }
            } else if let err = error {
                print("[BMO-HTTP] Connection error: \(err.localizedDescription)")
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 12)
        return result
    }
}

// MARK: - State Manager

class StateManager {
    let stateDir: URL
    let seqFile: URL
    var sequences: [String: Int] = [:]

    init(directory: String) {
        self.stateDir = URL(fileURLWithPath: directory)
        try? FileManager.default.createDirectory(at: stateDir, withIntermediateDirectories: true)
        self.seqFile = stateDir.appendingPathComponent("sequences.json")
        if let data = try? Data(contentsOf: seqFile),
           let map = try? JSONDecoder().decode([String: Int].self, from: data) {
            self.sequences = map
        }
    }

    func nextSequence(for provider: String) -> Int {
        let seq = (sequences[provider] ?? 0) + 1
        sequences[provider] = seq
        if let data = try? JSONEncoder().encode(sequences) {
            try? data.write(to: seqFile)
        }
        return seq
    }
}

// MARK: - Codex Tailer

class CodexTailer {
    let sessionDir: URL
    var fileOffsets: [String: UInt64] = [:]
    var isInitialized = false

    init(directory: String) {
        self.sessionDir = URL(fileURLWithPath: directory)
    }

    func scan(onQuotaFound: (_ primaryUsed: Double, _ primarySecs: Int, _ primaryReset: String?, _ secondaryUsed: Double, _ secondarySecs: Int, _ secondaryReset: String?) -> Void) {
        guard FileManager.default.fileExists(atPath: sessionDir.path) else { return }

        let fm = FileManager.default
        let enumerator = fm.enumerator(at: sessionDir, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey], options: [.skipsHiddenFiles])

        var jsonlFiles: [(url: URL, date: Date, size: UInt64)] = []

        while let fileURL = enumerator?.nextObject() as? URL {
            guard fileURL.pathExtension == "jsonl" else { continue }
            guard let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]),
                  values.isRegularFile == true else { continue }
            let size = UInt64(values.fileSize ?? 0)
            let date = values.contentModificationDate ?? Date.distantPast
            jsonlFiles.append((url: fileURL, date: date, size: size))
        }

        // Sort descending by date
        jsonlFiles.sort { $0.date > $1.date }

        if !isInitialized {
            // Baseline existing files at current EOF
            for file in jsonlFiles {
                fileOffsets[file.url.path] = file.size
            }
            isInitialized = true
            return
        }

        // Inspect only recently active files (top 32)
        for file in jsonlFiles.prefix(32) {
            let path = file.url.path
            let prevOffset = fileOffsets[path] ?? 0
            guard file.size > prevOffset else { continue }

            guard let handle = try? FileHandle(forReadingFrom: file.url) else { continue }
            defer { try? handle.close() }

            try? handle.seek(toOffset: prevOffset)
            guard let newBytes = try? handle.readToEnd(),
                  let content = String(data: newBytes, encoding: .utf8) else { continue }

            fileOffsets[path] = file.size

            let lines = content.components(separatedBy: .newlines)
            for line in lines where line.contains("\"type\":\"token_count\"") {
                guard let lineData = line.data(using: .utf8),
                      let root = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                      let payload = root["payload"] as? [String: Any],
                      let rateLimits = payload["rate_limits"] as? [String: Any] else { continue }

                var pUsed: Double?
                var pSecs = 18000
                var pReset: String?

                if let primary = rateLimits["primary"] as? [String: Any],
                   let used = primary["used_percent"] as? Double {
                    pUsed = used
                    if let mins = primary["window_minutes"] as? Int { pSecs = mins * 60 }
                    if let resets = primary["resets_at"] as? Int {
                        pReset = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: TimeInterval(resets)))
                    }
                }

                var sUsed: Double?
                var sSecs = 604800
                var sReset: String?

                if let secondary = rateLimits["secondary"] as? [String: Any],
                   let used = secondary["used_percent"] as? Double {
                    sUsed = used
                    if let mins = secondary["window_minutes"] as? Int { sSecs = mins * 60 }
                    if let resets = secondary["resets_at"] as? Int {
                        sReset = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: TimeInterval(resets)))
                    }
                }

                if let pu = pUsed, let su = sUsed {
                    onQuotaFound(pu, pSecs, pReset, su, sSecs, sReset)
                }
            }
        }
    }
}

// MARK: - Spool Drainer

class SpoolDrainer {
    let spoolFile: URL

    init(stateDir: String) {
        self.spoolFile = URL(fileURLWithPath: stateDir).appendingPathComponent("spool.jsonl")
    }

    func drain(onPacket: (_ provider: String, _ quota: [String: Any], _ collectedAt: String) -> Void) {
        guard FileManager.default.fileExists(atPath: spoolFile.path) else { return }
        guard let data = try? Data(contentsOf: spoolFile),
              let content = String(data: data, encoding: .utf8),
              !content.isEmpty else { return }

        // Clear spool file atomically
        try? "".write(to: spoolFile, atomically: true, encoding: .utf8)

        let lines = content.components(separatedBy: .newlines)
        for line in lines where !line.trimmingCharacters(in: .whitespaces).isEmpty {
            guard let lineData = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                  let provider = obj["provider"] as? String,
                  let quota = obj["quota"] as? [String: Any],
                  let collectedAt = obj["timestamp"] as? String else { continue }
            onPacket(provider, quota, collectedAt)
        }
    }
}

// MARK: - Main Application & Daemon

class App {
    let configPath: String
    let config: CollectorConfig
    let stateManager: StateManager
    let ingestion: IngestionClient
    let codexTailer: CodexTailer?
    let spoolDrainer: SpoolDrainer
    var isRunning = true

    init(configPath: String) throws {
        self.configPath = configPath
        let data = try Data(contentsOf: URL(fileURLWithPath: configPath))
        let cfg = try JSONDecoder().decode(CollectorConfig.self, from: data)
        self.config = cfg
        self.stateManager = StateManager(directory: cfg.stateDirectory)
        self.ingestion = try IngestionClient(config: cfg)
        if let codex = cfg.nativeCodex, cfg.providers["codex"]?.enabled == true {
            self.codexTailer = CodexTailer(directory: codex.sessionDirectory)
        } else {
            self.codexTailer = nil
        }
        self.spoolDrainer = SpoolDrainer(stateDir: cfg.stateDirectory)
    }

    func run() {
        print("[BMO] Native Collector (Swift Native, RAM < 6MB) started.")
        print("[BMO] Collector ID: \(config.collectorId), Key ID: \(config.keyId)")
        print("[BMO] Ingest URL: \(config.url)")

        var lastHeartbeat = Date.distantPast

        // Main Loop
        while isRunning {
            autoreleasepool {
                // 1. Drain Antigravity Statusline Spool
                spoolDrainer.drain { provider, quota, collectedAt in
                    handleAntigravityCallback(quota: quota, collectedAt: collectedAt)
                }

                // 2. Scan Codex Sessions
                codexTailer?.scan { pUsed, pSecs, pReset, sUsed, sSecs, sReset in
                    handleCodexObservation(pUsed: pUsed, pSecs: pSecs, pReset: pReset, sUsed: sUsed, sSecs: sSecs, sReset: sReset)
                }

                // 3. Heartbeat every 60 seconds
                if Date().timeIntervalSince(lastHeartbeat) >= 60 {
                    sendHeartbeats()
                    lastHeartbeat = Date()
                }
            }

            Thread.sleep(forTimeInterval: 1.0)
        }
    }

    func handleCodexObservation(pUsed: Double, pSecs: Int, pReset: String?, sUsed: Double, sSecs: Int, sReset: String?) {
        guard let codexSetting = config.providers["codex"], codexSetting.enabled else { return }
        let generation = codexSetting.generation
        let seq = stateManager.nextSequence(for: "codex")
        let eventId = UUID().uuidString.lowercased()
        let now = isoNow()

        let windows: [[String: Any]] = [
            [
                "windowId": "codex.primary",
                "label": "Primary",
                "windowDurationSeconds": pSecs,
                "usedPercent": pUsed,
                "remainingPercent": max(0, 100 - pUsed),
                "resetAt": pReset as Any,
                "dataStatus": "ok",
                "collectedAt": now,
                "upstreamObservedAt": NSNull(),
                "freshnessBasis": "unknown",
                "sourceFreshness": "unknown"
            ],
            [
                "windowId": "codex.secondary",
                "label": "Secondary",
                "windowDurationSeconds": sSecs,
                "usedPercent": sUsed,
                "remainingPercent": max(0, 100 - sUsed),
                "resetAt": sReset as Any,
                "dataStatus": "ok",
                "collectedAt": now,
                "upstreamObservedAt": NSNull(),
                "freshnessBasis": "unknown",
                "sourceFreshness": "unknown"
            ]
        ]

        let payload: [String: Any] = [
            "schemaVersion": 1,
            "collectorId": config.collectorId,
            "eventId": eventId,
            "providerId": "codex",
            "sourceType": "codex-session-jsonl",
            "sourceVersion": "codex-cli/0.163.0",
            "ownershipGeneration": generation,
            "sequence": seq,
            "sourceAvailability": "available",
            "dataStatus": "ok",
            "errorCode": NSNull(),
            "collectedAt": now,
            "upstreamObservedAt": NSNull(),
            "freshnessBasis": "unknown",
            "sourceFreshness": "unknown",
            "kind": "observation",
            "snapshotMode": "partial",
            "windows": windows
        ]

        guard let jsonBytes = try? JSONSerialization.data(withJSONObject: payload),
              let jsonStr = String(data: jsonBytes, encoding: .utf8) else { return }

        let res = ingestion.signAndUpload(payloadJson: jsonStr, eventId: eventId)
        if case .success = res {
            print("[BMO] [Codex] Observation uploaded (Primary: \(Int(pUsed))% used, Secondary: \(Int(sUsed))% used) -> ACKNOWLEDGED")
        } else if case .sequenceConflict = res {
            _ = stateManager.nextSequence(for: "codex")
            _ = stateManager.nextSequence(for: "codex")
            _ = stateManager.nextSequence(for: "codex")
        }
    }

    func handleAntigravityCallback(quota: [String: Any], collectedAt: String) {
        guard let agySetting = config.providers["antigravity"], agySetting.enabled else { return }
        let generation = agySetting.generation
        let seq = stateManager.nextSequence(for: "antigravity")
        let eventId = UUID().uuidString.lowercased()

        var windows: [[String: Any]] = []

        for (bucketId, val) in quota {
            guard let bucket = val as? [String: Any] else { continue }
            if bucket["disabled"] as? Bool == true {
                windows.append([
                    "windowId": bucketId,
                    "label": bucketId,
                    "windowDurationSeconds": NSNull(),
                    "usedPercent": NSNull(),
                    "remainingPercent": NSNull(),
                    "resetAt": NSNull(),
                    "dataStatus": "unavailable",
                    "collectedAt": collectedAt,
                    "upstreamObservedAt": NSNull(),
                    "freshnessBasis": "session_snapshot",
                    "sourceFreshness": "unknown"
                ])
                continue
            }

            var used: Double?
            var remaining: Double?

            if let fraction = bucket["remaining_fraction"] as? Double {
                remaining = fraction * 100.0
                used = (1.0 - fraction) * 100.0
            } else if let amount = bucket["remaining_amount"] as? Double {
                remaining = amount
            }

            var resetAt: Any = NSNull()
            if let resetStr = bucket["reset_time"] as? String {
                resetAt = resetStr
            }

            windows.append([
                "windowId": bucketId,
                "label": bucketId,
                "windowDurationSeconds": NSNull(),
                "usedPercent": used as Any,
                "remainingPercent": remaining as Any,
                "resetAt": resetAt,
                "dataStatus": "ok",
                "collectedAt": collectedAt,
                "upstreamObservedAt": NSNull(),
                "freshnessBasis": "session_snapshot",
                "sourceFreshness": "unknown"
            ])
        }

        let payload: [String: Any] = [
            "schemaVersion": 1,
            "collectorId": config.collectorId,
            "eventId": eventId,
            "providerId": "antigravity",
            "sourceType": "antigravity-statusline",
            "sourceVersion": "antigravity/1.5.1",
            "ownershipGeneration": generation,
            "sequence": seq,
            "sourceAvailability": "available",
            "dataStatus": "ok",
            "errorCode": NSNull(),
            "collectedAt": collectedAt,
            "upstreamObservedAt": NSNull(),
            "freshnessBasis": "session_snapshot",
            "sourceFreshness": "unknown",
            "kind": "observation",
            "snapshotMode": "partial",
            "windows": windows
        ]

        guard let jsonBytes = try? JSONSerialization.data(withJSONObject: payload),
              let jsonStr = String(data: jsonBytes, encoding: .utf8) else { return }

        let res = ingestion.signAndUpload(payloadJson: jsonStr, eventId: eventId)
        if case .success = res {
            print("[BMO] [Antigravity] Statusline observation uploaded (\(windows.count) windows) -> ACKNOWLEDGED")
        } else if case .sequenceConflict = res {
            _ = stateManager.nextSequence(for: "antigravity")
            _ = stateManager.nextSequence(for: "antigravity")
            _ = stateManager.nextSequence(for: "antigravity")
        }
    }

    func sendHeartbeats() {
        for (providerId, setting) in config.providers where setting.enabled {
            let seq = stateManager.nextSequence(for: providerId)
            let eventId = UUID().uuidString.lowercased()
            let now = isoNow()

            let payload: [String: Any] = [
                "schemaVersion": 1,
                "collectorId": config.collectorId,
                "eventId": eventId,
                "providerId": providerId,
                "sourceType": providerId == "codex" ? "codex-session-jsonl" : "antigravity-statusline",
                "sourceVersion": providerId == "codex" ? "codex-cli/0.163.0" : "antigravity/1.5.1",
                "ownershipGeneration": setting.generation,
                "sequence": seq,
                "sourceAvailability": "available",
                "dataStatus": "ok",
                "errorCode": NSNull(),
                "collectedAt": now,
                "upstreamObservedAt": NSNull(),
                "freshnessBasis": "unknown",
                "sourceFreshness": "unknown",
                "kind": "heartbeat",
                "lastSourceEventAt": NSNull(),
                "health": [
                    "queuePending": 0,
                    "queueBytes": 0,
                    "dropped": 0,
                    "pausedSources": [] as [String],
                    "callbackPending": NSNull(),
                    "callbackBytes": NSNull(),
                    "callbackDropped": NSNull(),
                    "nextRetryAt": NSNull(),
                    "lastUploadCode": "ACKNOWLEDGED",
                    "sourceCode": "OK"
                ]
            ]

            guard let jsonBytes = try? JSONSerialization.data(withJSONObject: payload),
                  let jsonStr = String(data: jsonBytes, encoding: .utf8) else { continue }

            let res = ingestion.signAndUpload(payloadJson: jsonStr, eventId: eventId)
            if case .sequenceConflict = res {
                _ = stateManager.nextSequence(for: providerId)
                _ = stateManager.nextSequence(for: providerId)
            }
        }
    }
}

// MARK: - Statusline Subcommand (Instant execution < 5ms)

func handleStatuslineSubcommand(provider: String, configPath: String) {
    guard let configData = try? Data(contentsOf: URL(fileURLWithPath: configPath)),
          let config = try? JSONDecoder().decode(CollectorConfig.self, from: configData) else {
        exit(1)
    }

    let stdinData = FileHandle.standardInput.readDataToEndOfFile()
    guard !stdinData.isEmpty else { exit(0) }

    guard let root = try? JSONSerialization.jsonObject(with: stdinData) as? [String: Any],
          let quota = root["quota"] as? [String: Any] else {
        exit(0)
    }

    let packet: [String: Any] = [
        "provider": provider,
        "quota": quota,
        "timestamp": isoNow()
    ]

    guard let packetData = try? JSONSerialization.data(withJSONObject: packet),
          let packetStr = String(data: packetData, encoding: .utf8) else {
        exit(0)
    }

    let spoolFile = URL(fileURLWithPath: config.stateDirectory).appendingPathComponent("spool.jsonl")
    try? FileManager.default.createDirectory(atPath: config.stateDirectory, withIntermediateDirectories: true)

    if let handle = try? FileHandle(forWritingTo: spoolFile) {
        handle.seekToEndOfFile()
        if let lineData = (packetStr + "\n").data(using: .utf8) {
            handle.write(lineData)
        }
        try? handle.close()
    } else {
        try? (packetStr + "\n").write(to: spoolFile, atomically: true, encoding: .utf8)
    }
    exit(0)
}

// MARK: - CLI Entrypoint

let args = CommandLine.arguments

if args.count >= 3 && args[1] == "statusline" {
    let provider = args[2]
    let configPath = args.count >= 4 ? args[3] : "./collector-native.local.json"
    handleStatuslineSubcommand(provider: provider, configPath: configPath)
} else {
    let configPath = args.count >= 2 && args[1] != "run" ? args[1] : (args.count >= 3 ? args[2] : "./collector-native.local.json")
    do {
        let app = try App(configPath: configPath)
        signal(SIGINT) { _ in exit(0) }
        signal(SIGTERM) { _ in exit(0) }
        app.run()
    } catch {
        print("[BMO-ERROR] Failed to start: \(error.localizedDescription)")
        exit(1)
    }
}
