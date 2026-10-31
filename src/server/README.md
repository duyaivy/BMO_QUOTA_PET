# Server boundary

Runtime configuration, Drizzle/libSQL persistence and owner authentication live here. Entry points import `server-only`. Browser and collector contracts must not import these modules. Cookie guards belong at each protected operation/data boundary; never rely on a visible navigation state. Migrations use checked-in SQL and a checksummed ledger. `writeTransaction` bounds and serializes local writes; external DB failures remain failures, never false success.

Ingestion commits replay claims, receipts, history and current projections transactionally. Quota queries guard owner reads; settings APIs guard Origin, owner session and CSRF, then use optimistic revision transactions. Device configuration remains local; no MQTT/outbox publication is enabled.
