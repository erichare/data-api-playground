# Architecture

## Overview

The Data API Playground is a Next.js application that lets users connect to a DataStax Astra DB instance, explore collections, ingest CSV data, and run natural language queries powered by a RAG pipeline (IBM watsonx Granite + vector/hybrid/lexical search).

All API routes run as Next.js route handlers (Node.js runtime). The frontend is a single-page React app with no dedicated backend service.

---

## Frontend

The app is a single page (`app/page.tsx`) composed of:

| Component | Location | Responsibility |
|---|---|---|
| `Header` | `components/shell/` | Connection status, settings button |
| `Sidebar` | `components/shell/` | Keyspace selector, collection list, conversation list, mode toggle |
| `ChatArea` | `components/chat/` | Conversation UI, query input, search mode toggle |
| `CollectionViewer` | `components/collection/` | Paginated document browser with sort/delete/export |
| `IngestPanel` | `components/collection/` | CSV drag-and-drop upload with streaming progress |
| `AstraConnectDialog` | `components/connection/` | Token/endpoint/watsonx key input |
| `NewCollectionDialog` | `components/collection/` | Create vector or vectorize-enabled collections |
| `QuickStartGuide` | `components/onboarding/` | SDK code examples in Python, TypeScript, Java, cURL |

All application state lives in `lib/hooks/usePlaygroundState.ts`.

---

## State Persistence

| What | Where | Survives page refresh? |
|---|---|---|
| Astra DB token | `sessionStorage` | Yes (until tab closes) |
| Astra DB endpoint | `sessionStorage` | Yes |
| IBM watsonx API key | `sessionStorage` | Yes |
| watsonx Project ID | `sessionStorage` | Yes |
| Conversations & messages | Astra DB (`dap_conversations` / `dap_messages`) | **Yes** |
| Collections list | React state (re-fetched on load) | Effectively yes |
| Keyspace selection | React state only | No |
| UI state (dialogs, view mode) | React state only | No |

---

## API Routes

All routes are Next.js route handlers at `app/api/`.

Credentials are passed as HTTP request headers (`x-astra-token`, `x-astra-endpoint`) rather than in the request body or URL to prevent token exposure in server logs and browser history.

### Infrastructure / Status

| Route | Method | Purpose |
|---|---|---|
| `/api/astra-status` | GET | Returns `{ hasToken, hasEndpoint }` — whether server env vars are set |

### Connection & Schema

| Route | Method | Key Inputs | Returns |
|---|---|---|---|
| `/api/connect` | POST | `token`, `endpoint`, `keyspace?` | All collections with vector metadata and estimated counts |
| `/api/keyspaces` | POST | `token`, `endpoint` | List of keyspace names |
| `/api/embedding-providers` | POST | `token`, `endpoint` | All vectorize provider/model options available on the DB |
| `/api/create-collection` | POST | `token`, `endpoint`, `name`, `dimension`, `metric`, `provider`, `model` | The created collection object |

### Data

| Route | Method | Key Inputs | Returns |
|---|---|---|---|
| `/api/browse` | POST | `token`, `endpoint`, `collection`, `pageState?`, `sort?` | 20 documents + next page cursor |
| `/api/count` | POST | `token`, `endpoint`, `collection` | Estimated document count |
| `/api/delete-documents` | POST | `token`, `endpoint`, `collection`, `ids[]` | Deleted count |
| `/api/ingest` | POST | `token`, `endpoint`, `collection`, `rows[]`, `filename` | NDJSON stream of progress events |

### Chat / RAG

| Route | Method | Key Inputs | Returns |
|---|---|---|---|
| `/api/chat` | POST | `query`, `searchMode`, `collections[]`, `activeCollection`, `history?` (headers: `x-astra-token`, `x-astra-endpoint`, `x-ibm-api-key?`, `x-watsonx-project-id?`) | NDJSON stream of 4-step pipeline events |

The chat pipeline steps:

```
1. analyze  — IBM Granite (watsonx) reads the query and outputs { collection, searchMode, intent, limit, sortField, sortDir }
              Only considers non-internal (non-dap_*) collections.
2. embed    — IBM Granite 125M generates a 768-dim vector for the query
              Uses watsonx AI SDK if IBM API key is set, otherwise falls back to HuggingFace Inference API.
              Skipped entirely if the target collection uses server-side $vectorize.
3. search   — Astra DB query using $vector / $vectorize / $hybrid / $text sort depending on mode
4. respond  — IBM Granite synthesizes a concise, format-matched natural language answer from retrieved documents
```

Each step streams two events: `{ step, status: "running" }` then `{ step, status: "complete", latencyMs, data }`.

### Conversations

Conversations and messages are stored in two internal Astra DB collections (`dap_conversations`, `dap_messages`) created automatically on first use. Credentials are passed via request headers.

| Route | Method | Purpose |
|---|---|---|
| `/api/conversations` | GET | List conversations (sorted by `updatedAt` desc) |
| `/api/conversations` | POST | Create a new conversation |
| `/api/conversations/[id]` | PATCH | Rename a conversation |
| `/api/conversations/[id]` | DELETE | Delete conversation and all its messages |
| `/api/conversations/[id]/messages` | GET | Load messages for a conversation |
| `/api/conversations/[id]/messages` | POST | Append a message (user or assistant) |

#### Data Model

**`dap_conversations`** — one document per thread:
```ts
{ _id: string; name: string; createdAt: string; updatedAt: string; messageCount: number; }
```

**`dap_messages`** — one document per message:
```ts
{ _id: string; conversationId: string; role: "user" | "assistant"; content: string; timestamp: string; }
```

#### Initialization Flow

```
On connect:
  1. Fetch GET /api/conversations → populate conversation list
  2. Select most recently updated conversation
  3. Fetch GET /api/conversations/[id]/messages → populate message list

On new conversation:
  1. POST /api/conversations → get new ID
  2. Add to local list, set as active

On send:
  1. POST user message to /api/conversations/[id]/messages immediately
  2. Stream /api/chat
  3. POST assistant message to /api/conversations/[id]/messages after stream ends

On conversation switch:
  1. Fetch /api/conversations/[id]/messages (lazy-loaded on demand)
  2. Switch view mode to Chat tab
```

---

## Internal Collections

Collections prefixed `dap_` are considered internal (used by the app for conversation persistence). They are:

- Hidden from the collection list by default (toggle via "＋internal" in the sidebar)
- Always sorted to the end of the list when shown
- Never selected as the default active collection
- Never queried by the AI pipeline unless explicitly instructed

---

## Environment Variables

```env
# Astra DB — required (or enter in the UI Connect dialog)
ASTRA_DB_APPLICATION_TOKEN=AstraCS:...
ASTRA_DB_API_ENDPOINT=https://<db-id>.apps.astra.datastax.com

# IBM watsonx — optional; enables real LLM + embedding pipeline
WATSONX_API_KEY=...
WATSONX_PROJECT_ID=...
WATSONX_SERVICE_URL=https://us-south.ml.cloud.ibm.com   # defaults to this if omitted
WATSONX_IAM_URL=https://iam.cloud.ibm.com/identity/token # defaults to this if omitted

# HuggingFace — fallback embedding provider if watsonx is not configured
HUGGINGFACE_API_KEY=hf_...
```
