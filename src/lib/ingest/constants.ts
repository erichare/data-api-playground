export const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_UPLOAD_MB = Math.round(
  MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024)
);
export const CSV_BATCH_SIZE = 20;
export const DOCUMENT_BATCH_SIZE = 10;
export const DEFAULT_CHUNK_SIZE = 1200;
export const DEFAULT_CHUNK_OVERLAP = 150;
export const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
export const MAX_DOCUMENT_CHUNKS = 500;
export const MIN_CHUNK_SIZE = 200;
export const MAX_CHUNK_SIZE = 4_000;
export const MAX_CSV_ROWS = 5_000;
export const MAX_METADATA_BYTES = 16 * 1024;
