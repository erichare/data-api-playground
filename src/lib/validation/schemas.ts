import { z } from "zod";

export const backendKindSchema = z.enum(["astra", "hcd"]).optional().default("astra");
export const knowledgeBackendKindSchema = z
  .enum(["astra", "hcd", "openrag"])
  .optional();

// ── Shared backend connection fields ────────────────────────────────
export const backendConnectionSchema = z.object({
  backend: backendKindSchema,
  token: z.string().optional(),
  endpoint: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  keyspace: z.string().optional(),
  fromAstraCli: z.boolean().optional(),
  astraCliProfile: z.string().optional(),
  astraCliDatabase: z.string().optional(),
});

export const knowledgeConnectionSchema = z.object({
  knowledgeBackend: knowledgeBackendKindSchema,
  openragApiKey: z.string().optional(),
  openragBaseUrl: z.string().optional(),
});

// ── Auth ─────────────────────────────────────────────────────────────
export const loginBodySchema = z.object({
  password: z.string().optional().default(""),
});

// ── Backend connection & browse ─────────────────────────────────────
export const connectBodySchema = backendConnectionSchema;

export const browseBodySchema = backendConnectionSchema.extend({
  collection: z.string().min(1),
  pageState: z.string().nullable().optional(),
  sort: z
    .object({
      col: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_.]*$/),
      dir: z.union([z.literal(1), z.literal(-1)]),
    })
    .optional(),
});

export const countBodySchema = backendConnectionSchema.extend({
  collection: z.string().min(1),
});

export const keyspacesBodySchema = backendConnectionSchema;

export const embeddingProvidersBodySchema = backendConnectionSchema;

// ── Field sampling ──────────────────────────────────────────────────
export const sampleFieldsBodySchema = backendConnectionSchema.extend({
  collection: z.string().min(1),
});

// ── Collection CRUD ──────────────────────────────────────────────────
export const createCollectionBodySchema = backendConnectionSchema.extend({
  name: z.string().min(1),
  dimension: z.number().int().positive(),
  metric: z.enum(["cosine", "dot_product", "euclidean"]),
  provider: z.string().min(1),
  model: z.string().trim().optional().default(""),
}).superRefine((value, ctx) => {
  if (value.provider !== "none" && value.model.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message: 'Model is required when provider is not "none"',
    });
  }
});

export const deleteCollectionBodySchema = backendConnectionSchema.extend({
  name: z.string().min(1),
});

// ── Documents ────────────────────────────────────────────────────────
export const deleteDocumentsBodySchema = backendConnectionSchema.extend({
  collection: z.string().min(1),
  ids: z.array(z.string()).min(1),
});

export const documentsDeleteBodySchema = backendConnectionSchema.extend({
  source_doc_id: z.string().min(1),
  collection: z.string().min(1),
}).merge(knowledgeConnectionSchema);

export const documentsChunksBodySchema = backendConnectionSchema.extend({
  source_doc_id: z.string().min(1),
  collection: z.string().min(1),
}).merge(knowledgeConnectionSchema);

// ── Ingest ───────────────────────────────────────────────────────────
export const ingestBodySchema = backendConnectionSchema.extend({
  collection: z.string().min(1),
  rows: z.array(z.record(z.string(), z.string())),
  filename: z.string().min(1),
  huggingfaceApiKey: z.string().optional(),
}).merge(knowledgeConnectionSchema);

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
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: z.string().min(1),
    searchMode: z.string().optional(),
    latencyMs: z.number().optional(),
    pipelineSteps: z.array(z.object({
      id: z.string(),
      status: z.string(),
      latencyMs: z.number().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
    sources: z.array(z.object({
      collection: z.string(),
      id: z.string(),
      similarity: z.number(),
      preview: z.record(z.string(), z.union([z.string(), z.number()])),
    })).optional(),
  }),
});

export const conversationTitleBodySchema = z.object({
  firstMessage: z.string().min(1),
  huggingfaceApiKey: z.string().optional(),
});

// ── Chat ─────────────────────────────────────────────────────────────
export const chatBodySchema = backendConnectionSchema.extend({
  query: z.string().min(1),
  isConnected: z.boolean().optional(),
  searchMode: z.enum(["vector", "hybrid", "lexical"]),
  collections: z
    .array(
      z.object({
        name: z.string(),
        isVectorize: z.boolean(),
        vectorDimension: z.number().int().positive().nullable().optional(),
      })
    )
    .optional(),
  activeCollection: z.string().optional(),
  allCollectionFields: z.record(z.string(), z.array(z.string())).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(50000),
      })
    )
    .max(100)
    .optional(),
  huggingfaceApiKey: z.string().optional(),
}).merge(knowledgeConnectionSchema);

// ── Data API Proxy ───────────────────────────────────────────────────
export const dataApiProxyBodySchema = backendConnectionSchema.extend({
  collection: z.string().min(1),
  requestBody: z.record(z.string(), z.unknown()),
});
