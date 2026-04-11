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
  const fileType = ["pdf", "txt", "md", "csv", "json", "docx"].includes(ext)
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
