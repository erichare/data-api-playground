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

function isTabularFileType(fileType: string): fileType is "csv" | "xlsx" {
  return fileType === "csv" || fileType === "xlsx";
}

function stringifyCellValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

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

export async function extractTabularRowChunks(
  buffer: Buffer,
  fileType: string
): Promise<string[] | null> {
  if (!isTabularFileType(fileType)) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    dense: true,
  });
  const includeSheetName = workbook.SheetNames.length > 1;
  const chunks: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });

    for (const row of rows) {
      const content = serializeTabularRow(
        row,
        includeSheetName ? sheetName : undefined
      );
      if (content.length > 0) {
        chunks.push(content);
      }
    }
  }

  return chunks;
}

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

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    // Ignore malformed optional metadata payloads.
  }
  if (metadataRaw.length > MAX_METADATA_BYTES) {
    throw new Error(
      `Metadata payload exceeds ${MAX_METADATA_BYTES.toLocaleString()} bytes`
    );
  }

  const filename = file.name;
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
