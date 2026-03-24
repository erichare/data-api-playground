# Data API Playground

An interactive web app for exploring [DataStax Astra DB](https://www.datastax.com/products/datastax-astra) via the Data API. Connect to your database, chat with your data using AI, browse collections, and ingest CSV files — all from a browser.

## Features

- **AI-powered chat** — Ask natural language questions about your data. IBM Granite analyzes the query, generates embeddings, searches Astra DB, and synthesizes a concise response.
- **Persistent conversations** — Conversations and messages are stored in Astra DB and survive page refresh. Create, rename, and delete threads from the sidebar.
- **Pipeline trace** — Watch each step in real time (Analyze → Embed → Search → Respond) with per-step latency.
- **Collection browser** — Browse documents in any collection with pagination and delete support.
- **CSV ingestion** — Upload CSV files and ingest them as vector documents, with progress streaming.
- **Collection management** — Create new collections with configurable vector dimensions, similarity metrics, and server-side vectorize providers.
- **Multiple search modes** — Hybrid (vector + keyword reranking), vector-only, or lexical.
- **Internal collections toggle** — `dap_*` collections used by the app are hidden by default and never queried by AI.
- **Quick Start Guide** — Inline code examples for Python, TypeScript, Java, and cURL.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Animation | Framer Motion |
| Database | DataStax Astra DB (`@datastax/astra-db-ts`) |
| AI / LLM | IBM watsonx Granite (`@ibm-cloud/watsonx-ai`) |
| Embeddings | IBM Granite 125M (`ibm/slate-125m-english-rtrvr-v2`) via watsonx or HuggingFace |

## Getting Started

### Prerequisites

- Node.js 18+
- A [DataStax Astra DB](https://astra.datastax.com) account with an Application Token and API Endpoint
- Optional: An [IBM watsonx](https://www.ibm.com/products/watsonx-ai) API key and Project ID

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# Required — or enter credentials directly in the UI
ASTRA_DB_APPLICATION_TOKEN=AstraCS:...
ASTRA_DB_API_ENDPOINT=https://<db-id>.apps.astra.datastax.com

# Optional — enables real LLM responses and embeddings
WATSONX_API_KEY=...
WATSONX_PROJECT_ID=...
WATSONX_SERVICE_URL=https://us-south.ml.cloud.ibm.com
WATSONX_IAM_URL=https://iam.cloud.ibm.com/identity/token

# Optional — fallback embedding provider if watsonx is not configured
HUGGINGFACE_API_KEY=hf_...
```

All credentials can also be entered at runtime via the Connect dialog in the app. They are stored in `sessionStorage` and never sent to any third party.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Connect** — Click "Connect Now" and enter your Astra DB token and API endpoint. Optionally add IBM watsonx credentials to enable AI-generated responses.
2. **Chat** — Type a question in the chat panel. The pipeline will analyze your intent, embed the query, search your collections, and return a natural language answer with source documents.
3. **Browse** — Click any collection in the sidebar to browse its documents, view vector dimensions, and delete records.
4. **Ingest** — Open the Ingest panel (right side) to upload a CSV file and stream it into a collection with automatic embedding.
5. **New Collection** — Click "+" in the sidebar to create a vector or vectorize-enabled collection.

## Project Structure

```
/
├── src/
│   ├── app/
│   │   ├── api/                    # Next.js route handlers
│   │   │   ├── chat/               # Streaming RAG pipeline
│   │   │   ├── ingest/             # CSV ingestion with embedding
│   │   │   ├── connect/            # Astra DB connection + collection list
│   │   │   ├── browse/             # Document pagination
│   │   │   ├── conversations/      # Conversation CRUD
│   │   │   │   └── [id]/
│   │   │   │       └── messages/   # Per-conversation message persistence
│   │   │   └── ...
│   │   └── page.tsx                # Main app shell (thin — delegates to usePlaygroundState)
│   ├── components/
│   │   ├── chat/                   # ChatArea, MessageBubble, PipelineTrace, SourceCard
│   │   ├── collection/             # CollectionViewer, NewCollectionDialog, IngestPanel
│   │   ├── connection/             # AstraConnectDialog
│   │   ├── onboarding/             # QuickStartGuide
│   │   ├── shell/                  # Header, Sidebar (true layout primitives)
│   │   └── ui/                     # shadcn/ui base components
│   └── lib/
│       ├── astra.ts                # Shared Astra DB client factory
│       ├── types.ts                # Shared TypeScript types
│       ├── hooks/
│       │   └── usePlaygroundState.ts  # All app-level state and handlers
│       └── mock/
│           ├── data.ts             # Mock collections, documents, and conversations
│           └── hints.ts            # Suggestion hints derived from mock data
└── docs/
    └── data_api_playground_proposal.pptx
```

## Notes

- If no IBM watsonx credentials are provided, the app falls back to a simple template response.
- If watsonx embedding is unavailable, the app tries HuggingFace as a fallback; if that also fails, random vectors are used (the rest of the pipeline still runs).
- Collections using Astra's server-side **vectorize** skip client-side embedding entirely — the `$vectorize` field is passed and Astra handles embedding automatically.
- Internal collections (prefixed `dap_`) store conversation history and are hidden from the UI by default.

> **Stack:** Next.js 16 App Router · `astra-db-ts` v2 · IBM WatsonX Granite · HuggingFace Embeddings

---

## App Architecture

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
| `/api/keyspaces` | `POST` | List available keyspaces |
| `/api/embedding-providers` | `POST` | List `$vectorize` providers from Astra |
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
| `WATSONX_SERVICE_URL` | IBM WatsonX | For AI features |
| `WATSONX_IAM_URL` | IBM WatsonX | For AI features |
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
