import { resolveAstraConnection } from "@/lib/astra";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_DOCUMENT_UPLOAD_MB,
  MAX_METADATA_BYTES,
  MIN_CHUNK_SIZE,
} from "@/lib/ingest/constants";
import type {
  NameConflictAction,
  ParsedDocumentUpload,
} from "@/lib/ingest/types";

function stringifyCellValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isTabularRowEmpty(row: readonly unknown[]): boolean {
  return row.every((cell) => stringifyCellValue(cell).trim().length === 0);
}

function buildTabularHeaders(headerRow: readonly unknown[]): string[] {
  let emptyHeaderCount = 0;

  return headerRow.map((cell) => {
    const header = stringifyCellValue(cell);
    if (header.trim().length > 0) {
      return header;
    }

    const fallback =
      emptyHeaderCount === 0 ? "__EMPTY" : `__EMPTY_${emptyHeaderCount}`;
    emptyHeaderCount += 1;
    return fallback;
  });
}

function rowsToTabularObjects(
  rows: readonly (readonly unknown[])[]
): Record<string, unknown>[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return [];
  }

  const headers = buildTabularHeaders(headerRow);

  return dataRows
    .filter((row) => !isTabularRowEmpty(row))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""])
      )
    );
}

/**
 * Serialize a tabular row into a searchable `key: value; key: value` string.
 * Optionally prefixes with the sheet name for multi-sheet Excel files.
 */
export function serializeTabularRow(
  row: Record<string, unknown>,
  sheetName?: string
): string {
  const parts = Object.entries(row)
    .filter(([, value]) => stringifyCellValue(value).trim().length > 0)
    .map(([key, value]) => `${key}: ${stringifyCellValue(value)}`);

  if (sheetName) {
    parts.unshift(`sheet: ${sheetName}`);
  }

  return parts.join("; ");
}

async function extractCsvRowChunks(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parse } = require("csv-parse/sync") as typeof import("csv-parse/sync");
  const rows = parse(buffer, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false,
  }) as Record<string, unknown>[];

  return rows
    .map((row) => serializeTabularRow(row))
    .filter((content) => content.length > 0);
}

async function extractXlsxRowChunks(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const readXlsxFile = require("read-excel-file/node")
    .default as typeof import("read-excel-file/node").default;
  const workbook = (await readXlsxFile(buffer, {
    trim: false,
  })) as Array<{
    data: unknown[][];
    sheet: string;
  }>;
  const includeSheetName = workbook.length > 1;
  const chunks: string[] = [];

  for (const { data, sheet } of workbook) {
    const rows = rowsToTabularObjects(data);

    for (const row of rows) {
      const content = serializeTabularRow(
        row,
        includeSheetName ? sheet : undefined
      );
      if (content.length > 0) {
        chunks.push(content);
      }
    }
  }

  return chunks;
}

/**
 * Extract rows from CSV or XLSX files as one serialized string per row.
 * @returns An array of serialized row strings, or `null` for non-tabular file types.
 */
export async function extractTabularRowChunks(
  buffer: Buffer,
  fileType: string
): Promise<string[] | null> {
  switch (fileType) {
    case "csv":
      return extractCsvRowChunks(buffer);
    case "xlsx":
      return extractXlsxRowChunks(buffer);
    default:
      return null;
  }
}

/**
 * Split text into chunks using a paragraph-aware strategy.
 *
 * Groups consecutive paragraphs up to `chunkSize` characters, then starts a
 * new chunk. Paragraphs longer than `chunkSize` are split with `overlap`
 * character overlap. Fragments shorter than 20 characters are discarded.
 *
 * @param chunkSize - Maximum characters per chunk (default 1200).
 * @param overlap - Character overlap between chunks for long paragraphs (default 150).
 */
export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current.length === 0) {
      current = paragraph;
    } else if (current.length + 2 + paragraph.length <= chunkSize) {
      current += `\n\n${paragraph}`;
    } else {
      if (current.length > 0) chunks.push(current.trim());
      if (paragraph.length > chunkSize) {
        for (let index = 0; index < paragraph.length; index += chunkSize - overlap) {
          const slice = paragraph.slice(index, index + chunkSize).trim();
          if (slice.length > 20) chunks.push(slice);
        }
        current = "";
      } else {
        current = paragraph;
      }
    }
  }

  if (current.trim().length > 20) chunks.push(current.trim());
  return chunks;
}

/**
 * Extract plain text from a file buffer based on its type.
 * Supports PDF, DOCX, JSON, CSV, XLSX, TXT, and Markdown.
 * Tabular files (CSV/XLSX) are serialized as one row per line.
 */
export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  const rowChunks = await extractTabularRowChunks(buffer, fileType);
  if (rowChunks) {
    return rowChunks.join("\n");
  }

  switch (fileType) {
    case "pdf": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse") as {
        PDFParse: new (opts: {
          data: Uint8Array;
        }) => { getText: () => Promise<{ text: string }> };
      };
      const result = await new PDFParse({
        data: new Uint8Array(buffer),
      }).getText();
      return result.text;
    }
    case "docx": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "json": {
      try {
        const parsed = JSON.parse(buffer.toString("utf-8"));
        return JSON.stringify(parsed, null, 2);
      } catch {
        return buffer.toString("utf-8");
      }
    }
    default:
      return buffer.toString("utf-8");
  }
}

function parseNameConflictAction(value: string | null | undefined) {
  const action = value ?? undefined;
  return action === "overwrite" || action === "skip"
    ? (action as NameConflictAction)
    : undefined;
}

/**
 * Parse and validate a multipart form-data document upload.
 *
 * Extracts the file, connection credentials, chunk size, metadata, and
 * conflict resolution action from the form data. Sanitizes the filename,
 * validates file size (max 50 MB), and resolves the Astra connection.
 *
 * @throws If no file is provided or the file exceeds the size limit.
 */
export async function parseDocumentUpload(
  formData: FormData
): Promise<ParsedDocumentUpload> {
  const file = formData.get("file") as File | null;
  if (!file) {
    throw new Error("No file provided");
  }

  const collectionName = (formData.get("collection") as string | null) ?? "";
  const { token, endpoint, keyspace } = resolveAstraConnection(
    {
      token: (formData.get("token") as string | null) ?? undefined,
      endpoint: (formData.get("endpoint") as string | null) ?? undefined,
      keyspace: (formData.get("keyspace") as string | null) ?? undefined,
    },
    { includeDefaultKeyspace: true }
  );
  const requestedChunkSize = parseInt(
    (formData.get("chunkSize") as string | null) ?? String(DEFAULT_CHUNK_SIZE)
  );
  const metadataRaw = (formData.get("metadata") as string | null) ?? "{}";
  const chunkSize = Number.isFinite(requestedChunkSize)
    ? Math.min(Math.max(requestedChunkSize, MIN_CHUNK_SIZE), MAX_CHUNK_SIZE)
    : DEFAULT_CHUNK_SIZE;
  const huggingfaceApiKey =
    (formData.get("huggingfaceApiKey") as string | null) ?? undefined;
  const nameConflictAction = parseNameConflictAction(
    formData.get("nameConflictAction") as string | null
  );

  if (metadataRaw.length > MAX_METADATA_BYTES) {
    throw new Error(
      `Metadata payload exceeds ${MAX_METADATA_BYTES.toLocaleString()} bytes`
    );
  }
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    // Ignore malformed optional metadata payloads.
  }

  const rawFilename = file.name;
  const filename = rawFilename
    .replace(/.*[/\\]/, "")
    .replace(/[^a-zA-Z0-9._\-\s]/g, "_")
    .slice(0, 255) || "upload";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "txt";
  const fileType = [
    "pdf",
    "txt",
    "md",
    "csv",
    "json",
    "docx",
    "xlsx",
  ].includes(ext)
    ? ext
    : "txt";
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_DOCUMENT_UPLOAD_MB} MB upload limit`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    file,
    filename,
    fileType,
    collectionName,
    token,
    endpoint,
    keyspace,
    chunkSize,
    metadata,
    buffer,
    huggingfaceApiKey,
    nameConflictAction,
  };
}
