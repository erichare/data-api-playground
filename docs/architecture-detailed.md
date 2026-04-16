# Architecture — Detailed Reference

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [Runtime Boundaries](#2-runtime-boundaries)
3. [Backend Model](#3-backend-model)
4. [Frontend Composition](#4-frontend-composition)
5. [State Model](#5-state-model)
6. [Service Layer](#6-service-layer)
7. [API Routes](#7-api-routes)
8. [Chat Workflow](#8-chat-workflow)
9. [Ingest Workflow](#9-ingest-workflow)
10. [Persistence Model](#10-persistence-model)
11. [Credential Flow](#11-credential-flow)
12. [Testing](#12-testing)

---

## 1. Repository Layout

```text
src/
├── app/
│   ├── api/                          # Next.js route handlers
│   │   ├── ai-status/
│   │   ├── astra-status/
│   │   ├── backend-status/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── conversations/
│   │   ├── browse/
│   │   ├── create-collection/
│   │   ├── delete-collection/
│   │   ├── documents/
│   │   ├── ingest/
│   │   ├── ingest-document/
│   │   ├── keyspaces/
│   │   ├── knowledge-backend-status/
│   │   └── ...
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # Top-level composition root
│
├── components/
│   ├── api/
│   ├── auth/
│   ├── chat/
│   ├── collection/
│   ├── connection/
│   ├── ingest/
│   ├── onboarding/
│   ├── shell/
│   └── ui/
│
└── lib/
    ├── ai/                           # AI provider resolution + model prep
    ├── astra.ts                      # Astra connection helpers
    ├── backends/                     # backend kinds, labels, env resolution
    ├── chat/                         # Chat workflow service + types
    ├── collections/                  # Collection/document domain logic
    ├── dataApi/                      # Astra/HCD data-backend adapters
    ├── db.ts                         # Local SQLite access
    ├── hcd.ts                        # HCD connection helpers
    ├── hooks/                        # Client-side orchestration hooks
    ├── ingest/                       # Ingest domain logic
    ├── knowledge/                    # Astra/HCD/OpenRAG knowledge adapters
    ├── playground/                   # Frontend API/client helpers
    ├── mock/
    ├── server/                       # Logging and server-only helpers
    ├── validation/                   # Request validation/parsing
    └── types.ts
```

---

## 2. Runtime Boundaries

The app uses the Next.js App Router with route handlers as the server transport boundary.

Key runtime rules:

- Browser clients talk only to this app's route handlers.
- Route handlers resolve credentials server-side before calling Astra, HCD, OpenRAG, Hugging Face, or Ollama.
- `src/proxy.ts` applies authentication gates and early request-body checks before route handlers read the payload.
- Shared parsers in `lib/validation/parse.ts` re-check streamed body sizes so chunked requests cannot bypass the proxy-level size guard.

Body-size policy:

- general API routes: 10 MB
- ingest routes: 50 MB
- document upload validation: 50 MB per file

---

## 3. Backend Model

The current architecture is easiest to understand as three independent backend axes.

### Data backends

Implemented in `lib/backends/*` and `lib/dataApi/*`.

| Backend | Responsibilities | Notable capabilities |
|---|---|---|
| `astra` | connect, keyspaces, browse/count, collection CRUD, API Explorer, raw Data API proxy | embedding-provider discovery, vectorize collections |
| `hcd` | same high-level app flows as Astra for connection/browse/chat/API exploration | no Astra-style embedding-provider discovery, no vectorize collections |

`GET /api/backend-status` reports env readiness for both backends and chooses the default env-backed connection order as:

1. Astra if ready
2. otherwise HCD if ready
3. otherwise no default backend

`GET /api/astra-status` still exists as a compatibility surface for Astra-only readiness checks.

### Knowledge backends

Implemented in `lib/knowledge/*`.

| Backend | Responsibilities | Notable capabilities |
|---|---|---|
| connected backend (`astra` / `hcd`) | retrieval, CSV ingest, document ingest/delete/load | vector, hybrid, lexical search |
| `openrag` | retrieval plus document ingest/delete/load | vector search only, no CSV ingest, no lexical/hybrid search |

`GET /api/knowledge-backend-status` reports OpenRAG env readiness independently from the selected data backend.

### AI backends

Implemented in `lib/ai/*`.

Resolution order:

1. manual Hugging Face key from the connection dialog
2. `HUGGINGFACE_API_KEY` from the server environment
3. local Ollama fallback

The AI backend is used for:

- chat request analysis
- final response generation
- client-side embedding generation when server-side vectorize is unavailable

---

## 4. Frontend Composition

The app is a single client-rendered shell using App Router.

### Top-level structure

`page.tsx` acts as the composition root:

```text
page.tsx
├── Header
├── Sidebar
├── PlaygroundMainPanel
│   ├── ViewModeSwitcher
│   ├── ChatArea
│   ├── IngestTab
│   └── ApiExplorer
└── PlaygroundDialogs
    ├── ConnectionDialog
    ├── NewCollectionDialog
    └── QuickStartGuide
```

### Feature composition

- `PlaygroundMainPanel` switches between `ChatArea`, `IngestTab`, and `ApiExplorer`
- `ChatArea` owns chat UI and streaming event consumption
- `IngestTab` coordinates ingest upload, the local document library, the raw collection browser, and the document viewer
- `ApiExplorer` owns request editing, generated SDK snippets, raw response display, and the runtime TypeScript client-call log
- `NewCollectionDialog` uses `useCollectionForm` plus `CollectionCodePreview` for collection creation and code previews
- `Sidebar` owns conversation and collection navigation
- `PlaygroundDialogs` centralizes the data/knowledge/AI connection, quick-start, and new-collection overlays

---

## 5. State Model

State is intentionally split instead of living in one giant hook.

### Hook split

| Hook | Responsibility |
|---|---|
| `usePlaygroundState` | top-level composition of app state and grouped shell props |
| `usePlaygroundConnection` | Astra/HCD credentials, collections, keyspaces, backend status |
| `useConversationState` | conversations, messages, persistence coordination |
| `useThemeState` | theme persistence and `<html>` class updates |
| `usePlaygroundAuth` | optional auth status and sign-out plumbing |
| feature hooks | collection form, document library, raw browser, ingest upload, chat session, and more |

### Persistence

| State | Storage |
|---|---|
| Astra or HCD credentials entered in the dialog | React state only (current page session) |
| OpenRAG runtime credentials | React state only (current page session) |
| Manual Hugging Face key | React state only (current page session) |
| Theme | `localStorage` |
| Conversations | local SQLite |
| Messages | local SQLite |
| Ingested document summaries | local SQLite |
| Collection metadata / keyspaces | fetched from the selected data backend on demand |
| Env-backed backend availability | fetched from `/api/backend-status` and held in React state |
| OpenRAG env availability | fetched from `/api/knowledge-backend-status` and held in dialog state |

---

## 6. Service Layer

The backend/domain logic is organized into adapters and services so route files stay thin.

### Backend adapters

| File | Role |
|---|---|
| `lib/backends/server.ts` | env/runtime resolution for Astra/HCD connections |
| `lib/dataApi/index.ts` | resolve Astra/HCD data-backend adapters |
| `lib/knowledge/index.ts` | resolve connected/OpenRAG knowledge adapters |

### AI and chat

| File | Role |
|---|---|
| `lib/ai/service.ts` | provider resolution, status checks, Ollama model prep, text generation, embeddings |
| `lib/chat/service.ts` | orchestrates analyze -> embed -> search -> respond |
| `lib/chat/prompt.ts` | analyze-prompt construction |
| `lib/chat/search.ts` | delegates retrieval to the resolved knowledge backend |
| `lib/chat/response.ts` | final response generation helpers |

### Collections and ingest

| File | Role |
|---|---|
| `lib/collections/service.ts` | collection CRUD plus ingested-document operations |
| `lib/ingest/service.ts` | extraction, chunking, embedding, CSV ingest, document ingest |
| `lib/ingest/backend.ts` | resolve ingest behavior against the active knowledge backend |

---

## 7. API Routes

All API routes run as Next.js route handlers on the Node.js runtime.

### Core routes

| Route | Method | Purpose |
|---|---|---|
| `/api/backend-status` | `GET` | report Astra/HCD env readiness and default backend |
| `/api/ai-status` | `GET` | report AI backend and Ollama model status |
| `/api/astra-status` | `GET` | report whether Astra env credentials are configured |
| `/api/knowledge-backend-status` | `GET` | report OpenRAG env readiness |
| `/api/auth/status` | `GET` | report whether app auth is enabled and active |
| `/api/auth/login` | `POST` | create the auth session cookie |
| `/api/auth/logout` | `POST` | clear the auth session cookie |
| `/api/chat` | `POST` | stream chat workflow events |
| `/api/connect` | `POST` | validate credentials and discover collections |
| `/api/keyspaces` | `POST` | list keyspaces for the selected data backend |
| `/api/browse` | `POST` | fetch paginated collection documents |
| `/api/count` | `POST` | return collection count |
| `/api/create-collection` | `POST` | create a collection |
| `/api/delete-collection` | `POST` | drop a collection |
| `/api/delete-documents` | `POST` | delete selected documents from a collection |
| `/api/documents` | `GET/DELETE` | list or delete ingested document summaries |
| `/api/documents/chunks` | `POST` | fetch chunk-level document details |
| `/api/ingest` | `POST` | stream CSV ingest progress |
| `/api/ingest-document` | `POST` | stream document extract/chunk/store progress |
| `/api/embedding-providers` | `POST` | list Astra embedding providers/models |
| `/api/data-api-proxy` | `POST` | proxy raw Data API requests through auth/runtime limits |
| `/api/typescript-client-calls` | `GET` | expose recorded client calls for the API explorer |
| `/api/conversations` | `GET/POST` | list or create conversations |
| `/api/conversations/[id]` | `PATCH/DELETE` | rename or delete a conversation |
| `/api/conversations/[id]/messages` | `GET/POST` | fetch or append conversation messages |
| `/api/conversations/title` | `POST` | best-effort title generation |

### Route design principle

Routes should:

- parse the request
- resolve credentials and environment
- delegate to a service or adapter
- shape the response or stream

Routes should not accumulate large amounts of feature logic.

---

## 8. Chat Workflow

`POST /api/chat` streams newline-delimited JSON step events.

### Stages

1. **Prepare** (optional)
   emitted when Ollama needs to verify or pull a local model before chat or embedding work continues
2. **Analyze**
   chooses collection, search mode, limits, filters, and whether search should be skipped
3. **Embed**
   generates a vector when the target collection is not using server-side vectorize
4. **Search**
   delegates retrieval to the resolved knowledge backend
5. **Respond**
   uses the resolved Hugging Face or Ollama chat backend to produce the final natural-language answer

### Backend-dependent behavior

- Connected Astra/HCD knowledge backends expose vector, hybrid, and lexical search depending on capabilities.
- OpenRAG narrows the available search modes to vector search.
- Astra vectorize collections skip client-side embedding and report `provider: "astra", model: "server-side vectorize"` for the embed stage.

### Outputs

The UI uses these streamed events to render:

- output
- generated code
- pipeline trace

---

## 9. Ingest Workflow

There are two main ingest modes.

### CSV ingest

`POST /api/ingest`

Flow:

1. receive rows
2. detect whether the collection uses server-side vectorize
3. either send `$vectorize` text or create vectors client-side
4. `insertMany` in batches
5. optionally emit `prepare` progress when Ollama needs a local embedding model
6. stream progress events

CSV ingest is currently a connected knowledge-backend feature. OpenRAG does not support CSV row ingest in this app.

### Document ingest

`POST /api/ingest-document`

Flow:

1. receive uploaded file via `FormData`
2. extract text from PDF, DOCX, TXT, MD, CSV, JSON, or XLSX
3. chunk content
4. embed or vectorize per chunk
5. store chunks in the active knowledge backend
6. store a summary record in local SQLite
7. optionally emit `prepare` progress when Ollama needs a local embedding model
8. stream progress events back to the client

Non-vectorize ingest fails fast on provider errors and validates embedding dimensions against collection metadata when available.

---

## 10. Persistence Model

### Local SQLite

`data/app.db` stores:

- conversations
- messages
- ingested document summaries

This means conversation history and document-library metadata are independent from backend connection state.

### Backends

Connected data backends store:

- user collections
- vector documents
- vectorize-enabled documents where supported
- chunked document content for connected ingest flows

OpenRAG stores:

- external search/index content referenced by the app
- document chunks retrievable through the OpenRAG adapter

The app's SQLite layer still tracks document references and metadata regardless of which knowledge backend stored the content.

Internal `dap_*` collections are hidden from normal exploration and filtered out of AI collection selection.

---

## 11. Credential Flow

Credentials can come from:

- environment variables on the server
- runtime values entered through the UI

### Current flow

1. the browser keeps user-entered Astra/HCD credentials, optional OpenRAG credentials, and the optional manual Hugging Face key in React state for the current page session
2. frontend code sends them to this app's API routes in request bodies or `FormData`
3. server routes resolve body credentials first, then fall back to environment variables
4. data-backend requests resolve Astra/HCD credentials independently from knowledge-backend requests
5. AI requests resolve the manual Hugging Face key first, then `HUGGINGFACE_API_KEY`, then local Ollama
6. the browser never talks directly to Astra, HCD, OpenRAG, Hugging Face, or Ollama

Routes should avoid putting credentials in query strings.

---

## 12. Testing

The project uses `vitest` for unit, hook, and route/service boundary tests, plus `playwright` for end-to-end browser coverage.

Current coverage includes:

- frontend helper utilities
- API Explorer helpers and core interaction flows
- data-backend, knowledge-backend, and AI helper logic
- composition hooks (`useConversationState`, `usePlaygroundConnection`, `usePlaygroundState`, `useThemeState`, `usePlaygroundAuth`)
- route-handler boundaries
- chat, collection, and ingest service modules
- shell, ingest, and chat feature components
- selective shell/component coverage (`page.tsx`, `Header`, `Sidebar`, `PlaygroundMainPanel`, `ConnectionDialog`)
- browser-level auth and shell smoke tests in `tests/e2e`

The testing strategy is intentionally focused on:

- pure helpers
- orchestration hooks
- route and service seams
- a small set of critical shell and feature components

rather than broad DOM-heavy component testing everywhere.
