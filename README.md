# BMO Personal

> Personal subscription-quota monitoring companion for Codex, Claude Code, and Antigravity, featuring honest freshness tracking, durable local ingestion, transactional MQTT delivery, and an ESP32 desk pet display.

---

## 1. Overview

**BMO Personal** monitors subscription quota observations from the owner's official local developer CLIs (Codex, Claude Code, and Antigravity) without extracting credentials or scraping private web sessions. Observations are normalized, cryptographically signed, and ingested into a local Next.js fullstack cloud application backed by Turso (SQLite/libSQL). 

A transactional **MQTT Outbox** publishes versioned retained snapshots to an EMQX broker, where a physical ESP32 OLED desk pet receives and displays real-time quota progress and pixel animations.

### Core Principles & Architecture
- **Single Owner:** Password-only administration via Argon2id + sealed revocable `iron-session` cookie. No public registration or multi-tenant complexity.
- **Honest Freshness:** Delivery timestamp does not equal observation timestamp. Missing quota is labeled `unavailable`, expired reset periods are marked `stale`, and unverified providers are never fabricated.
- **Local Credential Privacy:** Official CLIs manage provider credentials. BMO collector code never touches provider token stores or calls upstream LLM APIs.
- **Transactional Outbox Pattern:** Device state changes and accepted telemetry atomically queue versioned messages in `mqtt_outbox`. A bounded lease-based drain handles delivery, backoff, and crashed-worker recovery with zero untracked background promises.
- **Strict Device Secret Isolation:** ESP32 devices connect using per-device subscribe ACLs (`bmo/v1/devices/<deviceId>/#`). Server-only MQTT publisher keys and administrative secrets are never delivered to or stored on personal devices.

---

## 2. Project Status & Roadmap

| Phase | Description | Status | Verification Summary |
|---|---|---|---|
| **Phase 1** | Fullstack Foundation & Synthetic Collector MVP | **Complete** | Next.js 16 App Router, Tailwind CSS, shadcn/ui, libSQL migrations, HMAC signed ingestion, 60 Node + 12 Chrome tests passed. |
| **Phase 2** | Real Provider Integration & Local Automation | **Partial (2A/2D Complete)** | **2A** verified with native Codex 0.163.0 JSONL session capture. **2D** reliability and LaunchAgent template verified. **2B/2C** parser and private spool implemented; awaiting live owner callback evidence. |
| **Phase 3** | MQTT & Device Configuration | **Complete** | Versioned contracts (8 KiB ceiling), native MQTT 3.1.1 publisher, transactional outbox (`0005_mqtt_outbox.sql`), lease-based drain, device CRUD, retirement tombstones, and ESP32 subscriber simulation. |
| **Phase 4** | ESP32 Firmware & Physical BMO | *Next* | ESP32-CAM Wi-Fi provisioning, SSD1306 128×64 OLED quota screens, animations, and buttons. |
| **Phase 5** | Cloud Deployment & End-to-End Release | *Upcoming* | Render web service, production Turso, EMQX Cloud broker, external maintenance cron, and end-to-end reliability verification. |

---

## 3. Prerequisites & Local Setup

### Requirements
- **Node.js:** `24.18.0` (managed via `.nvmrc`)
- **pnpm:** `11.24.0` (pinned in `package.json`)

### Installation

```sh
# 1. Clone and install dependencies with frozen lockfile
pnpm install --frozen-lockfile

# 2. Copy local environment template
cp .env.example .env.local
```

### Environment Configuration

1. Generate a secure random session secret (minimum 32 characters):
   ```sh
   openssl rand -hex 32
   ```
   Set `SESSION_SECRET` in `.env.local`.

2. Generate an Argon2id password hash for the owner account:
   ```sh
   python3 -c 'import getpass,sys; sys.stdout.write(getpass.getpass("Owner password: "))' | pnpm exec tsx scripts/auth-hash.ts
   ```
   Paste the emitted `ADMIN_PASSWORD_HASH=...` line into `.env.local` (preserve escaped `$` characters).

3. Apply database migrations to local libSQL:
   ```sh
   pnpm db:migrate
   ```

4. Start the local development server:
   ```sh
   pnpm dev
   ```
   Access the dashboard at `http://127.0.0.1:3000`.

---

## 4. Environment Variables Reference

| Variable | Required | Default / Example | Purpose |
|---|---|---|---|
| `BMO_APP_ORIGIN` | Yes | `http://127.0.0.1:3000` | Canonical application origin for CSRF and cookie validation |
| `TURSO_DATABASE_URL` | Yes | `file:./.data/bmo.db` | libSQL local database file or remote `libsql://` Turso URL |
| `TURSO_AUTH_TOKEN` | Remote only | `""` | Auth token for remote Turso database |
| `ADMIN_PASSWORD_HASH` | Yes | Argon2id string | Encoded Argon2id hash of owner administration password |
| `SESSION_SECRET` | Yes | 32+ char string | Random secret used for sealing `iron-session` cookies |
| `BMO_ALLOW_LOCAL_DATABASE` | Optional | `true` | Explicit opt-in for serving local file DB under `pnpm start` |
| `BMO_INGEST_KEYS_JSON` | Yes (for Ingest) | `{"key-id":"64-char-hex"}` | Key ID to 32-byte secret map for collector HMAC authentication |
| `MQTT_HOST` | Optional | `localhost` / `mqtt.flespi.io` | EMQX / MQTT broker host |
| `MQTT_PORT` | Optional | `8883` (TLS) or `1883` | MQTT broker port |
| `MQTT_USERNAME` | Optional | `""` | Server-only MQTT publisher username |
| `MQTT_PASSWORD` | Optional | `""` | Server-only MQTT publisher password |
| `MQTT_USE_TLS` | Optional | `true` | Force TLS on/off for broker connection |
| `BMO_MAINTENANCE_SECRET` | Optional | `""` | Bearer token for authenticating `POST /api/internal/maintenance` |

---

## 5. Development & Testing Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start loopback development server on port 3000 |
| `pnpm build` | Production build using supported Webpack compiler |
| `pnpm start` | Run production server locally via loopback proxy entrypoint (`scripts/serve.ts`) |
| `pnpm db:migrate` | Apply incremental checksummed migrations from `drizzle/` |
| `pnpm typecheck` | Generate Next.js route types and verify strict TypeScript |
| `pnpm lint` | Run ESLint with zero-warning threshold |
| `pnpm format:check` | Verify Prettier formatting across source and documentation |
| `pnpm format` | Apply Prettier code formatting |
| `pnpm test:unit` | Run all Vitest unit and integration tests (MQTT, DB, Ingestion, Collector) |
| `pnpm test:integration` | Run Playwright browser suite on port 3100 (build first) |
| `pnpm collector` | Run local CLI fixture collector foreground uploader |
| `pnpm collector:native` | Run native statusline collector uploader |

### Running Browser Tests
```sh
pnpm build
pnpm exec playwright install chromium
pnpm test:integration
```

---

## 6. Repository Layout

```text
├── drizzle/                      # Checksummed SQL migrations (0001 to 0005)
│   ├── 0001_initial.sql          # Core settings, provider metadata, auth sessions
│   ├── 0002_ingestion.sql        # Quota observations, windows, receipts, nonces
│   ├── 0003_device_configuration.sql # Devices & ordered OLED screens
│   ├── 0004_collector_health.sql # Diagnostic collector health telemetry
│   └── 0005_mqtt_outbox.sql      # Transactional outbox & operational leases
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (protected)/          # Protected dashboard routes (/, /devices, /collectors, /settings, /status)
│   │   ├── api/                  # Route handlers (auth, internal ingestion, maintenance, devices)
│   │   └── login/                # Owner login page
│   ├── components/               # React UI components
│   │   ├── device/               # Screen ordering editor & 128×64 OLED pixel preview
│   │   ├── quota/                # Provider quota cards & dynamic window gauges
│   │   └── shell/                # App shell, navigation header, status badges
│   ├── contracts/                # Shared browser-safe schemas & DTOs
│   │   ├── dashboard.ts          # Device configuration & dashboard views
│   │   ├── mqtt/                 # Versioned MQTT Config & Snapshot schemas (8 KiB ceiling)
│   │   └── usage/                # Telemetry event schemas & canonical semantic hash
│   └── server/                   # Server-only boundary
│       ├── auth/                 # Sealed cookie session & Argon2id verification
│       ├── config/               # Validated server runtime environment
│       ├── db/                   # Drizzle ORM instance, migrations runner, transaction helper
│       ├── devices/              # Device repository, optimistic revision CAS, provisioning
│       ├── ingestion/            # HMAC-SHA256 signature check & observation persistence
│       ├── maintenance/          # Authenticated maintenance runner & database pruning
│       └── mqtt/                 # MQTT 3.1.1 publisher, projection, outbox & lease drain
├── collector/                    # Local Mac Companion Collector package
│   ├── src/adapters/             # Codex JSONL tail, Claude statusline, Antigravity statusline
│   ├── src/queue/                # Private SQLite spool, deduplication, retry backoff
│   └── src/transport/            # HMAC signing & HTTPS ingestion upload
├── tests/
│   ├── browser/                  # Playwright browser integration specs
│   ├── db/                       # Database migration & persistence tests
│   ├── devices/                  # Device CRUD, revision conflict & tombstone tests
│   ├── fixtures/                 # Mock MQTT broker & simulated ESP32 subscriber
│   ├── ingestion/                # Telemetry ingestion & signature verification tests
│   ├── maintenance/              # Maintenance API & state transition tests
│   ├── mqtt/                     # MQTT contracts, publisher, projection & outbox drain tests
│   └── integration/              # End-to-end MQTT pipeline tests
└── docs/                         # Architecture Decision Records (ADRs) & roadmap checkpoints
```

---

## 7. MQTT & Device Protocol

### Topic Hierarchy
- `bmo/v1/devices/<deviceId>/config` (QoS 1, Retained): Monotonic configuration revision containing ordered screens (PET screen fixed at index 0, followed by quota screens).
- `bmo/v1/devices/<deviceId>/snapshot` (QoS 1, Retained): Projected quota snapshot with per-window validity deadlines (`validUntil`), reset timestamps, and dynamic percentage gauges.

### Retained State & Lifecycle
1. **Outbox Synchronization:** When configuration changes or new quota arrives, the server atomically records a new message in `mqtt_outbox`.
2. **Lease-based Drain:** Background workers acquire an atomic lease via `operational_state` before publishing to the broker, preventing race conditions.
3. **Firmware Reboot Recovery:** On power-up or reconnect, the ESP32 receives the latest retained messages from both topics, restoring display state without waiting for a new observation.
4. **Device Retirement:** Retiring a device queues zero-byte tombstones with the Retained flag, purging broker retained state and prompting connected devices to enter an unconfigured idle state.

---

## 8. License

Personal project — All rights reserved. 
from duyaivy with love
