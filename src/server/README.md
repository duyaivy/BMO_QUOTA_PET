# Server boundary

Future database, authentication, ingestion, and delivery modules belong here in their owning phases. Add `import "server-only"` to server implementation entry points. Browser components and `src/contracts` must never import server modules or secrets. Phase 1A has no backend operations or required environment variables.
