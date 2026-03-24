# Data API Playground

> **Stack:** Next.js 14 App Router · `astra-db-ts` v2 · IBM WatsonX Granite · HuggingFace Embeddings

---

## Overview

```
┌─────────────────────┐     streaming NDJSON      ┌──────────────────────────────────────┐
│   React Frontend    │ ─────── POST /api/chat ──► │          Next.js API Routes          │
│                     │ ◄─────────────────────────  │  (Node.js runtime, no edge)          │
│  ChatArea           │                             └──────────────────────────────────────┘
│  CollectionViewer   │                                    │            │           │
│  PipelineTrace      │       REST calls                   │            │           │
│  IngestPanel        │ ──── other /api/* routes ──►       ▼            ▼           ▼
│  AstraConnectDialog │                             Astra DB     IBM WatsonX   HuggingFace
└─────────────────────┘                             (search)     (LLM+embed)   (embed fallback)
```

---

## AI Chat Pipeline — 4 Steps

Each request to `POST /api/chat` streams a sequence of NDJSON events, one per step.

### ① Analyze
| | |
|---|---|
| **Model** | `ibm/granite-3-8b-instruct` via WatsonX `textChat()` |
| **Input** | User query + known collection names + field list |
| **Output** | `collection`, `searchMode`, `intent`, `limit`, `sortField`, `sortDir`, `filterField`, `filterOp`, `filterValue`, `skipSearch` |
| **Fallback** | Defaults used if WatsonX key not configured |

### ② Embed
| | |
|---|---|
| **Primary** | `ibm/slate-125m-english-rtrvr-v2` via WatsonX `textEmbedding()` |
| **Fallback** | HuggingFace `feature-extraction` pipeline |
| **Skip condition** | Collection uses `$vectorize` (server-side embeddings in Astra) |
| **Output** | `float32[]` vector, preview of first 8 dims |

### ③ Search
| | |
|---|---|
| **Client** | `@datastax/astra-db-ts` v2 |
| **Field sort** | `collection.find({}, { sort: { [field]: 1\|-1 }, limit })` |
| **Vector** | `collection.find({}, { sort: { $vector: embedding }, includeSimilarity: true })` |
| **Vectorize** | `collection.find({}, { sort: { $vectorize: query } })` |
| **Hybrid** | `collection.findAndRerank({}, { sort: { $hybrid: { $vectorize: query } } })` |
| **Filter** | Auto-applied when analyze detects a field constraint; retried without if unsupported |

### ④ Respond
| | |
|---|---|
| **Model** | `ibm/granite-3-8b-instruct` via WatsonX `textChat()` |
| **Context** | Top search results injected as structured text |
| **History** | Last 10 conversation turns included |
| **Output** | Natural language answer — supports markdown, tables, lists |

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | `POST` | Main AI pipeline (streaming) |
| `/api/connect` | `POST` | Validate token + endpoint, returns resolved creds |
| `/api/browse` | `POST` | Paginated document fetch for Browse view |
| `/api/ingest` | `POST` | Bulk insert CSV/JSON/JSONL into a collection |
| `/api/create-collection` | `POST` | Create collection with optional vector config |
| `/api/delete-collection` | `POST` | Drop a collection |
| `/api/delete-documents` | `POST` | Delete documents by filter |
| `/api/count` | `POST` | `estimatedDocumentCount()` |
| `/api/keyspaces` | `GET` | List available keyspaces |
| `/api/embedding-providers` | `GET` | List `$vectorize` providers from Astra |
| `/api/conversations` | `GET/POST` | Conversation list + create |
| `/api/conversations/[id]` | `GET/DELETE` | Get or delete a conversation |
| `/api/conversations/[id]/messages` | `POST` | Append message to conversation |
| `/api/astra-status` | `GET` | Whether Astra env vars are set |
| `/api/watsonx-status` | `GET` | Whether WatsonX env vars are set |

---

## External Services

### DataStax Astra DB
- **Auth:** Application token (`AstraCS:…`)
- **Client:** `@datastax/astra-db-ts` v2
- **Key APIs:** `find`, `findAndRerank`, `insertMany`, `deleteMany`, `estimatedDocumentCount`, `listCollections`
- **Vector modes:** `$vector` (manual), `$vectorize` (server-side), `$hybrid` (reranked)

### IBM WatsonX AI
- **Auth:** IBM Cloud IAM key + Project ID
- **SDK:** `@ibm-cloud/watsonx-ai` + `ibm-cloud-sdk-core`
- **Chat model:** `ibm/granite-3-8b-instruct` — query analysis & response generation
- **Embed model:** `ibm/slate-125m-english-rtrvr-v2` — query vectorization

### HuggingFace *(embed fallback)*
- **Auth:** `HUGGINGFACE_API_KEY` (optional)
- **API:** `feature-extraction` inference endpoint
- **Used when:** WatsonX embed fails or key not configured

---

## Environment Variables

| Variable | Service | Required |
|---|---|---|
| `ASTRA_DB_APPLICATION_TOKEN` | Astra DB | Yes (or set in UI) |
| `ASTRA_DB_API_ENDPOINT` | Astra DB | Yes (or set in UI) |
| `WATSONX_API_KEY` | IBM WatsonX | For AI features |
| `WATSONX_PROJECT_ID` | IBM WatsonX | For AI features |
| `HUGGINGFACE_API_KEY` | HuggingFace | Optional embed fallback |

> All env vars can be overridden at runtime via the Connect Dialog — values are stored in `sessionStorage` and passed with each API request.

---

## Client State

```
sessionStorage
├── astra_token          ← resolved token (env or user-entered)
├── astra_endpoint       ← resolved endpoint
├── ibm_api_key          ← WatsonX API key
└── watsonx_project_id   ← WatsonX project ID
```

The `initializing` React state gate prevents the connect overlay from flashing on refresh when credentials are already present in `sessionStorage`.

---

## Streaming Protocol

`POST /api/chat` returns `Content-Type: text/plain` with newline-delimited JSON events:

```jsonc
{ "step": "analyze",  "status": "running" }
{ "step": "analyze",  "status": "complete", "latencyMs": 42,  "data": { "collection": "bullets_v2", "limit": 3, "sortField": "bullet_rf_score", "sortDir": "desc" } }
{ "step": "embed",    "status": "skipped" }
{ "step": "search",   "status": "running" }
{ "step": "search",   "status": "complete", "latencyMs": 67,  "data": { "command": "await db.collection(\"bullets_v2\")\n  .find({}, { sort: { bullet_rf_score: -1 }, limit: 3 })\n  .toArray()", "count": 3, "results": [...] } }
{ "step": "respond",  "status": "running" }
{ "step": "respond",  "status": "complete", "latencyMs": 810, "data": { "content": "Here are the top 3 bullets…" } }
```
