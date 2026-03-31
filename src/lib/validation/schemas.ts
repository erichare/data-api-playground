import { z } from "zod";

// ── Shared Astra connection fields ──────────────────────────────────
export const astraConnectionSchema = z.object({
  token: z.string().optional(),
  endpoint: z.string().optional(),
  keyspace: z.string().optional(),
});

// ── Auth ─────────────────────────────────────────────────────────────
export const loginBodySchema = z.object({
  password: z.string().optional().default(""),
});

// ── Astra connection & browse ────────────────────────────────────────
export const connectBodySchema = astraConnectionSchema;

export const browseBodySchema = astraConnectionSchema.extend({
  collection: z.string().min(1),
  pageState: z.string().optional(),
  sort: z
    .object({ col: z.string(), dir: z.union([z.literal(1), z.literal(-1)]) })
    .optional(),
});

export const countBodySchema = astraConnectionSchema.extend({
  collection: z.string().min(1),
});

export const keyspacesBodySchema = astraConnectionSchema;

export const embeddingProvidersBodySchema = astraConnectionSchema;

// ── Collection CRUD ──────────────────────────────────────────────────
export const createCollectionBodySchema = astraConnectionSchema.extend({
  name: z.string().min(1),
  dimension: z.number().int().positive(),
  metric: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
});

export const deleteCollectionBodySchema = astraConnectionSchema.extend({
  name: z.string().min(1),
});

// ── Documents ────────────────────────────────────────────────────────
export const deleteDocumentsBodySchema = astraConnectionSchema.extend({
  collection: z.string().min(1),
  ids: z.array(z.string()).min(1),
});

export const documentsDeleteBodySchema = astraConnectionSchema.extend({
  source_doc_id: z.string().min(1),
  collection: z.string().min(1),
});

export const documentsChunksBodySchema = astraConnectionSchema.extend({
  source_doc_id: z.string().min(1),
  collection: z.string().min(1),
});

// ── Ingest ───────────────────────────────────────────────────────────
export const ingestBodySchema = astraConnectionSchema.extend({
  collection: z.string().min(1),
  rows: z.array(z.record(z.string(), z.string())),
  filename: z.string().min(1),
});

// ── Conversations ────────────────────────────────────────────────────
export const conversationCreateBodySchema = z.object({
  name: z.string().optional(),
});

export const conversationUpdateBodySchema = z.object({
  name: z.string().min(1),
});

export const messageCreateBodySchema = z.object({
  message: z.object({
    id: z.string().min(1),
    role: z.string().min(1),
    content: z.string(),
    timestamp: z.string().min(1),
    searchMode: z.string().optional(),
    latencyMs: z.number().optional(),
    pipelineSteps: z.array(z.unknown()).optional(),
    sources: z.array(z.unknown()).optional(),
  }),
});

export const conversationTitleBodySchema = z.object({
  firstMessage: z.string().min(1),
  ibmApiKey: z.string().optional(),
  watsonxProjectId: z.string().optional(),
});

// ── Chat ─────────────────────────────────────────────────────────────
export const chatBodySchema = astraConnectionSchema.extend({
  query: z.string().min(1),
  searchMode: z.string().min(1),
  collections: z
    .array(z.object({ name: z.string(), isVectorize: z.boolean() }))
    .optional(),
  activeCollection: z.string().optional(),
  allCollectionFields: z.record(z.string(), z.array(z.string())).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  ibmApiKey: z.string().optional(),
  watsonxProjectId: z.string().optional(),
});

// ── Data API Proxy ───────────────────────────────────────────────────
export const dataApiProxyBodySchema = astraConnectionSchema.extend({
  collection: z.string().min(1),
  requestBody: z.record(z.string(), z.unknown()),
});
