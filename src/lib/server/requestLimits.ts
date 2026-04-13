/** Maximum request body size for general API routes (10 MB). */
export const DEFAULT_API_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
/** Maximum request body size for ingest routes (50 MB). */
export const INGEST_API_BODY_LIMIT_BYTES = 50 * 1024 * 1024;

// Keep Next.js proxy buffering aligned with our ingest route allowance so
// multipart bodies are not truncated before route handlers can validate them.
export const NEXT_PROXY_CLIENT_MAX_BODY_SIZE = "50mb";
