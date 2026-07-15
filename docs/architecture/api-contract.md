# API Contract

ApiaryLens exposes a same-origin REST API under `/api/v1` and publishes an OpenAPI
3.1 document generated from the shared runtime schemas. Every response includes the
product build identity and compatible API, synchronization, and schema versions in
headers or the documented response envelope.

Protected routes derive user and organization context from the validated server
session. A client-provided organization identifier is a resource selector only and
never an authorization grant. Errors use stable machine codes, a safe user message,
an optional field map, and a redacted request correlation ID.

Writes accept an `Idempotency-Key` where retry is safe and use entity versions for
optimistic concurrency. Collection endpoints use bounded opaque cursors. File
uploads have explicit type and size limits and are authorized before bytes are
accepted. The OpenAPI document, generated client types, and profile conformance
tests are release artifacts.
