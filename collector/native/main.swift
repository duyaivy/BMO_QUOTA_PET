import Foundation
import CryptoKit

// Ensure stdout and stderr are unbuffered/line-buffered when redirected to log files
let _ = setlinebuf(stdout)
let _ = setlinebuf(stderr)

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

struct CodexQuotaSnapshot {
    let pUsed: Double
    let pSecs: Int
    let pReset: String?
    let sUsed: Double
    let sSecs: Int
    let sReset: String?
}

class CodexTailer {
    let sessionDir: URL
    let stateDir: URL
    let offsetFile: URL
    var fileOffsets: [String: UInt64] = [:]

    init(directory: String, stateDirectory: String) {
        self.sessionDir = URL(fileURLWithPath: directory)
        self.stateDir = URL(fileURLWithPath: stateDirectory)
        self.offsetFile = stateDir.appendingPathComponent("codex-offsets.json")
        try? FileManager.default.createDirectory(at: stateDir, withIntermediateDirectories: true)

        if let data = try? Data(contentsOf: offsetFile),
           let map = try? JSONDecoder().decode([String: UInt64].self, from: data) {
            self.fileOffsets = map
        }
    }

    func saveOffsets() {
        if let data = try? JSONEncoder().encode(fileOffsets) {
            try? data.write(to: offsetFile)
        }
    }

    func findRecentSessionFiles() -> [(url: URL, date: Date, size: UInt64)] {
        let fm = FileManager.default
        guard fm.fileExists(atPath: sessionDir.path) else { return [] }

        var results: [(url: URL, date: Date, size: UInt64)] = []
        var searchDirPaths = Set<String>()
        let now = Date()
        let cal = Calendar(identifier: .gregorian)

        // 1. Direct path check for today and past 3 days in both Local and UTC timezones (< 2ms)
        for tz in [TimeZone.current, TimeZone(secondsFromGMT: 0)!] {
            let fmt = DateFormatter()
            fmt.timeZone = tz
            fmt.dateFormat = "yyyy/MM/dd"
            for dayOffset in [0, -1, -2, -3] {
                if let d = cal.date(byAdding: .day, value: dayOffset, to: now) {
                    let sub = fmt.string(from: d)
                    let dir = sessionDir.appendingPathComponent(sub)
                    if fm.fileExists(atPath: dir.path) {
                        searchDirPaths.insert(dir.path)
                    }
                }
            }
        }

        // 2. Structural discovery fallback: traverse newest year -> month -> day folders
        if searchDirPaths.count < 3 {
            if let years = try? fm.contentsOfDirectory(atPath: sessionDir.path).sorted(by: >) {
                for year in years where year.count == 4 && Int(year) != nil {
                    let yearDir = sessionDir.appendingPathComponent(year)
                    if let months = try? fm.contentsOfDirectory(atPath: yearDir.path).sorted(by: >) {
                        for month in months where month.count == 2 && Int(month) != nil {
                            let monthDir = yearDir.appendingPathComponent(month)
                            if let days = try? fm.contentsOfDirectory(atPath: monthDir.path).sorted(by: >) {
                                for day in days where day.count == 2 && Int(day) != nil {
                                    searchDirPaths.insert(monthDir.appendingPathComponent(day).path)
                                    if searchDirPaths.count >= 7 { break }
                                }
                            }
                            if searchDirPaths.count >= 7 { break }
                        }
                    }
                    if searchDirPaths.count >= 7 { break }
                }
            }
        }

        // 3. Fallback for flat directory structure if no subfolders exist
        if searchDirPaths.isEmpty {
            searchDirPaths.insert(sessionDir.path)
        }

        // 4. Collect regular jsonl files
        for path in searchDirPaths {
            let dir = URL(fileURLWithPath: path)
            if let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil, options: .skipsHiddenFiles) {
                for f in files where f.pathExtension == "jsonl" {
                    guard let attrs = try? fm.attributesOfItem(atPath: f.path),
                          let type = attrs[.type] as? FileAttributeType, type == .typeRegular else { continue }
                    let size = (attrs[.size] as? NSNumber)?.uint64Value ?? 0
                    let date = (attrs[.modificationDate] as? Date) ?? Date.distantPast
                    results.append((url: f, date: date, size: size))
                }
            }
        }

        // Sort by modification date descending; tie-break with filename descending
        results.sort {
            if $0.date != $1.date {
                return $0.date > $1.date
            }
            return $0.url.lastPathComponent > $1.url.lastPathComponent
        }
        return results
    }

    func parseLine(_ line: String) -> CodexQuotaSnapshot? {
        guard line.contains("\"type\":\"token_count\""),
              let lineData = line.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
              let payload = root["payload"] as? [String: Any],
              let rateLimits = payload["rate_limits"] as? [String: Any] else { return nil }

        var pUsed: Double?
        var pSecs = 18000
        var pReset: String?

        if let primary = rateLimits["primary"] as? [String: Any],
           let used = (primary["used_percent"] as? NSNumber)?.doubleValue {
            pUsed = round(used * 100.0) / 100.0
            if let mins = (primary["window_minutes"] as? NSNumber)?.intValue { pSecs = mins * 60 }
            if let resets = (primary["resets_at"] as? NSNumber)?.doubleValue {
                pReset = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: TimeInterval(resets)))
            }
        }

        var sUsed: Double = 0.0
        var sSecs = 604800
        var sReset: String?

        if let secondary = rateLimits["secondary"] as? [String: Any],
           let used = (secondary["used_percent"] as? NSNumber)?.doubleValue {
            sUsed = round(used * 100.0) / 100.0
            if let mins = (secondary["window_minutes"] as? NSNumber)?.intValue { sSecs = mins * 60 }
            if let resets = (secondary["resets_at"] as? NSNumber)?.doubleValue {
                sReset = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: TimeInterval(resets)))
            }
        }

        if let pu = pUsed {
            return CodexQuotaSnapshot(pUsed: pu, pSecs: pSecs, pReset: pReset, sUsed: sUsed, sSecs: sSecs, sReset: sReset)
        }
        return nil
    }

    /// Discovers the latest active quota from recent session files (inspecting reverse order)
    func discoverLatestQuota() -> CodexQuotaSnapshot? {
        let files = findRecentSessionFiles()
        guard !files.isEmpty else { return nil }

        for f in files.prefix(12) {
            guard let handle = try? FileHandle(forReadingFrom: f.url) else { continue }
            defer { try? handle.close() }

            let readLen: UInt64 = min(f.size, 256 * 1024)
            let startOffset = f.size > readLen ? (f.size - readLen) : 0
            try? handle.seek(toOffset: startOffset)
            guard let data = try? handle.readToEnd(), let content = String(data: data, encoding: .utf8) else { continue }

            let lines = content.components(separatedBy: .newlines)
            for line in lines.reversed() {
                if let q = parseLine(line) {
                    print("[CodexTailer] Discovered active Codex quota in \(f.url.lastPathComponent): Primary \(q.pUsed)%, Secondary \(q.sUsed)%")
                    return q
                }
            }
        }
        return nil
    }

    /// Baseline all current session file offsets to their end
    func baselineOffsets() {
        let files = findRecentSessionFiles()
        for f in files {
            fileOffsets[f.url.path] = f.size
        }
        saveOffsets()
        print("[CodexTailer] Baselined \(files.count) files to offsets")
    }

    /// Scan recent files for newly appended lines and emit the latest quota
    func scan(onQuotaFound: (_ quota: CodexQuotaSnapshot) -> Void) {
        let files = findRecentSessionFiles()
        guard !files.isEmpty else { return }

        var latestQuota: CodexQuotaSnapshot?

        for f in files.prefix(16) {
            let path = f.url.path
            let prevOffset = fileOffsets[path] ?? 0

            if f.size > prevOffset {
                guard let handle = try? FileHandle(forReadingFrom: f.url) else { continue }
                defer { try? handle.close() }

                try? handle.seek(toOffset: prevOffset)
                guard let data = try? handle.readToEnd(), !data.isEmpty else { continue }

                // Only consume complete lines ending with newline (0x0a)
                guard let lastNewline = data.lastIndex(of: 0x0a) else { continue }
                let validData = data[...lastNewline]
                let bytesConsumed = UInt64(validData.count)

                fileOffsets[path] = prevOffset + bytesConsumed
                saveOffsets()

                guard let content = String(data: validData, encoding: .utf8) else { continue }
                let lines = content.components(separatedBy: .newlines)
                for line in lines.reversed() {
                    if let q = parseLine(line) {
                        latestQuota = q
                        break // Captured the latest quota in this file chunk
                    }
                }
            }
        }

        if let q = latestQuota {
            onQuotaFound(q)
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
        var latestPerProvider: [String: (quota: [String: Any], timestamp: String)] = [:]
        for line in lines.reversed() where !line.trimmingCharacters(in: .whitespaces).isEmpty {
            guard let lineData = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                  let provider = obj["provider"] as? String,
                  let quota = obj["quota"] as? [String: Any],
                  let collectedAt = obj["timestamp"] as? String else { continue }
            if latestPerProvider[provider] == nil {
                latestPerProvider[provider] = (quota, collectedAt)
            }
        }

        for (provider, info) in latestPerProvider {
            onPacket(provider, info.quota, info.timestamp)
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

    // Persistent pending quotas for retry when server is temporarily unreachable
    var pendingCodexQuota: CodexQuotaSnapshot?
    var pendingAntigravityPayload: (quota: [String: Any], collectedAt: String)?
    var lastCodexAttempt = Date.distantPast
    var lastAgyAttempt = Date.distantPast

    init(configPath: String) throws {
        self.configPath = configPath
        let data = try Data(contentsOf: URL(fileURLWithPath: configPath))
        let cfg = try JSONDecoder().decode(CollectorConfig.self, from: data)
        self.config = cfg
        self.stateManager = StateManager(directory: cfg.stateDirectory)
        self.ingestion = try IngestionClient(config: cfg)
        if let codex = cfg.nativeCodex, cfg.providers["codex"]?.enabled == true {
            let tailer = CodexTailer(directory: codex.sessionDirectory, stateDirectory: cfg.stateDirectory)
            // Initial discovery: find latest known quota from sessions
            if let activeQuota = tailer.discoverLatestQuota() {
                self.pendingCodexQuota = activeQuota
            }
            tailer.baselineOffsets()
            self.codexTailer = tailer
        } else {
            self.codexTailer = nil
        }
        self.spoolDrainer = SpoolDrainer(stateDir: cfg.stateDirectory)
    }

    func run() {
        print("[BMO] Native Collector (Swift Native, RAM < 6MB) started.")
        print("[BMO] Collector ID: \(config.collectorId), Key ID: \(config.keyId)")
        print("[BMO] Ingest URL: \(config.url)")
        print("[BMO] Codex tailer: \(codexTailer == nil ? "DISABLED" : "ENABLED")")

        var lastHeartbeat = Date.distantPast

        // Main Loop
        while isRunning {
            autoreleasepool {
                let now = Date()

                // 1. Scan Codex Sessions for live updates
                codexTailer?.scan { quota in
                    self.pendingCodexQuota = quota
                }

                // Retry or upload pending Codex quota
                if let codexQuota = self.pendingCodexQuota, now.timeIntervalSince(lastCodexAttempt) >= 3.0 {
                    lastCodexAttempt = now
                    if uploadCodexObservation(quota: codexQuota) {
                        self.pendingCodexQuota = nil
                    }
                }

                // 2. Drain Antigravity Statusline Spool (coalesced to latest)
                spoolDrainer.drain { provider, quota, collectedAt in
                    self.pendingAntigravityPayload = (quota, collectedAt)
                }

                // Retry or upload pending Antigravity quota
                if let agy = self.pendingAntigravityPayload, now.timeIntervalSince(lastAgyAttempt) >= 3.0 {
                    lastAgyAttempt = now
                    if uploadAntigravityCallback(quota: agy.quota, collectedAt: agy.collectedAt) {
                        self.pendingAntigravityPayload = nil
                    }
                }

                // 3. Heartbeat every 60 seconds
                if now.timeIntervalSince(lastHeartbeat) >= 60 {
                    sendHeartbeats()
                    lastHeartbeat = now
                }
            }

            Thread.sleep(forTimeInterval: 1.0)
        }
    }

    func uploadCodexObservation(quota: CodexQuotaSnapshot) -> Bool {
        guard let codexSetting = config.providers["codex"], codexSetting.enabled else { return true }
        let generation = codexSetting.generation
        let now = isoNow()

        let pUsed = quota.pUsed
        let pRem = round((100.0 - pUsed) * 100.0) / 100.0
        let sUsed = quota.sUsed
        let sRem = round((100.0 - sUsed) * 100.0) / 100.0

        let windows: [[String: Any]] = [
            [
                "windowId": "codex.primary",
                "label": "Primary",
                "windowDurationSeconds": quota.pSecs,
                "usedPercent": pUsed,
                "remainingPercent": max(0, pRem),
                "resetAt": quota.pReset as Any,
                "dataStatus": "ok",
                "collectedAt": now,
                "upstreamObservedAt": NSNull(),
                "freshnessBasis": "unknown",
                "sourceFreshness": "unknown"
            ],
            [
                "windowId": "codex.secondary",
                "label": "Secondary",
                "windowDurationSeconds": quota.sSecs,
                "usedPercent": sUsed,
                "remainingPercent": max(0, sRem),
                "resetAt": quota.sReset as Any,
                "dataStatus": "ok",
                "collectedAt": now,
                "upstreamObservedAt": NSNull(),
                "freshnessBasis": "unknown",
                "sourceFreshness": "unknown"
            ]
        ]

        let basePayload: [String: Any] = [
            "schemaVersion": 1,
            "collectorId": config.collectorId,
            "providerId": "codex",
            "sourceType": "codex-session-jsonl",
            "sourceVersion": "codex-cli/0.163.0",
            "ownershipGeneration": generation,
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

        var attempts = 0
        while attempts < 3 {
            attempts += 1
            let seq = stateManager.nextSequence(for: "codex")
            let eventId = UUID().uuidString.lowercased()

            var payload = basePayload
            payload["sequence"] = seq
            payload["eventId"] = eventId

            guard let jsonBytes = try? JSONSerialization.data(withJSONObject: payload),
                  let jsonStr = String(data: jsonBytes, encoding: .utf8) else { return false }

            let res = ingestion.signAndUpload(payloadJson: jsonStr, eventId: eventId)
            if case .success = res {
                print("[BMO] [Codex] Observation uploaded (Primary: \(Int(pUsed))% used, Secondary: \(Int(sUsed))% used) -> ACKNOWLEDGED")
                return true
            } else if case .sequenceConflict = res {
                _ = stateManager.nextSequence(for: "codex")
                _ = stateManager.nextSequence(for: "codex")
                continue
            } else {
                return false
            }
        }
        return false
    }

    func uploadAntigravityCallback(quota: [String: Any], collectedAt: String) -> Bool {
        guard let agySetting = config.providers["antigravity"], agySetting.enabled else { return true }
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
                remaining = round(fraction * 10000.0) / 100.0
                used = round((100.0 - remaining!) * 100.0) / 100.0
            } else if let amount = bucket["remaining_amount"] as? Double {
                remaining = round(amount * 100.0) / 100.0
                used = round((100.0 - remaining!) * 100.0) / 100.0
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
              let jsonStr = String(data: jsonBytes, encoding: .utf8) else { return false }

        let res = ingestion.signAndUpload(payloadJson: jsonStr, eventId: eventId)
        if case .success = res {
            print("[BMO] [Antigravity] Statusline observation uploaded (\(windows.count) windows) -> ACKNOWLEDGED")
            return true
        } else if case .sequenceConflict = res {
            _ = stateManager.nextSequence(for: "antigravity")
            _ = stateManager.nextSequence(for: "antigravity")
            _ = stateManager.nextSequence(for: "antigravity")
            return false
        }
        return false
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
