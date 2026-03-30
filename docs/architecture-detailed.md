# Architecture — Detailed Reference

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [Frontend Composition](#2-frontend-composition)
3. [State Model](#3-state-model)
4. [Service Layer](#4-service-layer)
5. [API Routes](#5-api-routes)
6. [Chat Workflow](#6-chat-workflow)
7. [Ingest Workflow](#7-ingest-workflow)
8. [Persistence Model](#8-persistence-model)
9. [Credential Flow](#9-credential-flow)
10. [Testing](#10-testing)

---

## 1. Repository Layout

```
src/
├── app/
│   ├── api/                          # Next.js route handlers
│   │   ├── chat/
│   │   ├── conversations/
│   │   ├── browse/
│   │   ├── create-collection/
│   │   ├── delete-collection/
│   │   ├── documents/
│   │   ├── ingest/
│   │   ├── ingest-document/
│   │   └── ...
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # Top-level composition root
│
├── components/
│   ├── api/
│   ├── chat/
│   ├── collection/
│   ├── connection/
│   ├── ingest/
│   ├── onboarding/
│   ├── shell/
│   └── ui/
│
└── lib/
    ├── astra.ts                      # Shared Astra connection helpers
    ├── chat/                         # Chat workflow service + types
    ├── collections/                  # Collection/document domain logic
    ├── ingest/                       # Ingest domain logic
    ├── db.ts                         # Local SQLite access
    ├── hooks/                        # Client-side orchestration hooks
    ├── playground/                   # Frontend API/client helpers
    ├── mock/
    └── types.ts
```

---

## 2. Frontend Composition

The app is a single client-rendered shell using App Router.

### Top-level structure

`page.tsx` now acts as the composition root:

```
page.tsx
├── Header
├── Sidebar
├── PlaygroundMainPanel
│   ├── ViewModeSwitcher
│   ├── ChatArea
│   ├── IngestTab
│   └── ApiExplorer
└── PlaygroundDialogs
    ├── AstraConnectDialog
    ├── NewCollectionDialog
    ├── IngestDialog
    └── QuickStartGuide
```

### Feature composition

- `ChatArea` owns chat UI and streaming event consumption
- `IngestTab` coordinates ingest upload, document library, and raw browsing
- `CollectionViewer` owns collection browsing, sorting, export, and generated code
- `Sidebar` owns conversation and collection navigation

The page layer no longer owns every layout and modal concern inline.

---

## 3. State Model

State is no longer centralized in one giant hook.

### Hook split

| Hook | Responsibility |
|---|---|
| `usePlaygroundState` | Top-level composition of app state |
| `usePlaygroundConnection` | Astra credentials, theme, collections, keyspaces |
| `useConversationState` | Conversations, messages, persistence coordination |
| feature hooks | collection browse, document library, raw browser, ingest upload, etc. |

### Persistence

| State | Storage |
|---|---|
| Astra token / endpoint | `sessionStorage` |
| watsonx credentials | `sessionStorage` |
| Theme | `localStorage` |
| Conversations | local SQLite |
| Messages | local SQLite |
| Ingested document summaries | local SQLite |
| Collection metadata | fetched from Astra on demand |

---

## 4. Service Layer

The backend/domain logic is organized into service modules so route files stay thin.

### Chat

| File | Role |
|---|---|
| `lib/chat/service.ts` | orchestrates analyze → embed → search → respond |
| `lib/chat/types.ts` | shared request/event/result types |
| `app/api/chat/shared.ts` | lower-level prompt, embedding, search, response helpers |

### Collections

| File | Role |
|---|---|
| `lib/collections/service.ts` | create/delete collections, list/delete ingested docs |

### Ingest

| File | Role |
|---|---|
| `lib/ingest/service.ts` | extraction, chunking, embedding, CSV ingest, document ingest |

This is the main architectural shift from the earlier codebase: route handlers are now transport adapters, not the home of most business logic.

---

## 5. API Routes

All API routes run as Next.js route handlers on the Node.js runtime.

### Core routes

| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | `POST` | stream chat workflow events |
| `/api/connect` | `POST` | validate credentials and discover collections |
| `/api/keyspaces` | `POST` | list Astra keyspaces |
| `/api/browse` | `POST` | fetch paginated collection documents |
| `/api/count` | `POST` | return collection count |
| `/api/create-collection` | `POST` | create a collection |
| `/api/delete-collection` | `POST` | drop a collection |
| `/api/delete-documents` | `POST` | delete selected documents from a collection |
| `/api/documents` | `GET/DELETE` | list or delete ingested document summaries |
| `/api/ingest` | `POST` | stream CSV ingest progress |
| `/api/ingest-document` | `POST` | stream document extract/chunk/store progress |
| `/api/conversations` | `GET/POST` | list or create conversations |
| `/api/conversations/[id]` | `PATCH/DELETE` | rename or delete a conversation |
| `/api/conversations/[id]/messages` | `GET/POST` | fetch or append conversation messages |

### Route design principle

Routes should:
- parse the request
- resolve credentials / environment
- delegate to a service
- shape the response or stream

Routes should not accumulate large amounts of feature logic.

---

## 6. Chat Workflow

`POST /api/chat` streams newline-delimited JSON step events.

### Stages

1. **Analyze**
   chooses collection, search mode, limits, filters, and whether search should be skipped
2. **Embed**
   generates a vector when the target collection is not using Astra server-side vectorize
3. **Search**
   queries Astra with sort, filter, vector, vectorize, or hybrid behavior
4. **Respond**
   uses watsonx Granite to produce the final natural-language answer

### Outputs

The UI uses these streamed events to render:
- output
- generated code
- pipeline trace

---

## 7. Ingest Workflow

There are two main ingest modes.

### CSV ingest

`POST /api/ingest`

Flow:
1. receive rows
2. detect whether the collection uses server-side vectorize
3. either send `$vectorize` text or create vectors client-side
4. `insertMany` in batches
5. stream progress events

### Document ingest

`POST /api/ingest-document`

Flow:
1. receive uploaded file via `FormData`
2. extract text from PDF/DOCX/TXT/MD/CSV/JSON
3. chunk content
4. embed or vectorize per chunk
5. store chunks in Astra
6. store a summary record in local SQLite
7. stream progress events back to the client

---

## 8. Persistence Model

### Local SQLite

`data/app.db` stores:
- conversations
- messages
- ingested document summaries

This means conversation history and document-library metadata are independent from Astra connection state.

### Astra DB

Astra stores:
- user collections
- vector documents
- vectorize-enabled documents
- chunked document content for ingest flows

Internal `dap_*` collections are hidden from normal exploration and filtered out of AI collection selection.

---

## 9. Credential Flow

Credentials can come from:
- environment variables on the server
- runtime values entered through the UI

### Current flow

1. the browser stores user-entered credentials in `sessionStorage`
2. frontend code sends them to this app's API routes in request bodies
3. server routes resolve body credentials first, then fall back to environment variables
4. the browser never talks to Astra directly

Routes should avoid putting credentials in query strings.

---

## 10. Testing

The project uses `vitest` for lightweight unit and route/service boundary tests.

Current coverage includes:
- frontend helper utilities
- collection helper logic
- conversation hook behavior
- route-handler boundaries
- chat, collection, and ingest service modules

The current testing strategy is intentionally focused on:
- pure helpers
- orchestration hooks
- route/service seams

rather than broad DOM-heavy component testing.
