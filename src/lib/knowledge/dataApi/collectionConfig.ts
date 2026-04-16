/* eslint-disable security/detect-object-injection -- Helpers operate on validated, server-controlled keys when iterating documents. */
import * as astra from "@/lib/astra";
import type { ResolvedAiBackend } from "@/lib/ai/service";
import type { CollectionDescription, IngestBackendHint } from "@/lib/ingest/types";
import type { KnowledgeSource } from "@/lib/knowledge/types";

export function docPreview(
  doc: Record<string, unknown>
): Record<string, string | number> {
  const preview: Record<string, string | number> = {};
  let count = 0;

  for (const [key, value] of Object.entries(doc)) {
    if (astra.SYSTEM_FIELDS.has(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      preview[key] = typeof value === "boolean" ? String(value) : value;
      if (++count >= 4) break;
    }
  }

  return preview;
}

export function mapCollectionDescriptionToSource(
  description: CollectionDescription
): KnowledgeSource {
  const vectorDef = description.definition?.vector;
  const service = vectorDef?.service ?? null;

  return {
    name: description.name,
    vectorDimension: vectorDef?.dimension ?? null,
    vectorizeProvider: service?.provider ?? null,
    vectorizeModel: service?.modelName ?? null,
  };
}

function isKnowledgeSource(
  input: CollectionDescription | KnowledgeSource
): input is KnowledgeSource {
  return "vectorizeProvider" in input || "vectorizeModel" in input || "vectorDimension" in input;
}

export function getCollectionConfig(
  input: CollectionDescription | KnowledgeSource | undefined
) {
  if (!input) {
    return {
      useVectorize: false,
      vectorDimension: null,
      vectorizeProvider: "astra",
      vectorizeModel: "server-side vectorize",
    };
  }

  if (!isKnowledgeSource(input)) {
    return getCollectionConfig(mapCollectionDescriptionToSource(input));
  }

  return {
    useVectorize: !!input.vectorizeProvider,
    vectorDimension: input.vectorDimension ?? null,
    vectorizeProvider: input.vectorizeProvider ?? "astra",
    vectorizeModel: input.vectorizeModel ?? "server-side vectorize",
  };
}

export function getBackendHint(
  input: CollectionDescription | KnowledgeSource | undefined,
  backend: ResolvedAiBackend | null
): IngestBackendHint {
  const config = getCollectionConfig(input);

  if (config.useVectorize) {
    return {
      provider: config.vectorizeProvider,
      model: config.vectorizeModel,
    };
  }

  if (!backend) {
    return {
      provider: "unknown",
      model: "unknown",
    };
  }

  return {
    provider: backend.provider,
    model: backend.embedModel,
  };
}

export function validateVectorDimension(args: {
  collection: string;
  expected: number | null;
  embeddings: number[][];
}) {
  const { collection, expected, embeddings } = args;
  if (!expected || embeddings.length === 0) return;

  const actual = embeddings[0]?.length ?? 0;
  if (actual !== expected) {
    throw new Error(
      `Embedding dimension mismatch for "${collection}": collection expects ${expected}d but active model returned ${actual}d`
    );
  }
}
