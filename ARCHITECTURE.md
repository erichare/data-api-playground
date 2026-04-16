# Architecture

## Overview

The Data API Playground is a Next.js App Router application that separates three backend concerns:

- data backend: Data API or DataStax HCD
- knowledge backend: the connected backend or OpenRAG
- AI backend: Hugging Face or local Ollama

All API routes run as Next.js route handlers in the Node.js runtime. The frontend is a single client-rendered React shell that delegates data, knowledge, and AI work to server-side adapters.

## Request Boundaries

- Browser clients talk only to this app's route handlers.
- Route handlers resolve data-backend, knowledge-backend, and AI credentials server-side before calling Astra, HCD, OpenRAG, Hugging Face, or Ollama.
- Optional app-level auth is enforced in the proxy and route handlers through `requireApiAuth`. `PLAYGROUND_AUTH_PASSWORD` accepts either a plaintext value or a bcrypt hash.

Body-size limits are intentionally split:

- General API requests: 10 MB
- Ingest API requests: 50 MB
- Document upload validation: 50 MB per file

`src/proxy.ts` performs an early header-based check, while shared route parsing enforces the same limits against the actual streamed body so chunked or missing-header requests cannot bypass them.

## Backend Axes

### Data backends

Data-backend resolution lives in `src/lib/backends/server.ts` and `src/lib/dataApi/*`.

Options:

- `astra`
- `hcd`

Shared responsibilities:

- connect and collection discovery
- browse/count/sample-fields
- collection CRUD
- delete-documents
- raw Data API proxying for the API Explorer

Backend-specific behavior:

- Astra supports embedding-provider discovery and vectorize-enabled collection creation.
- HCD shares the same high-level app flows, but does not expose Astra-style embedding-provider discovery or vectorize collections.
- `GET /api/backend-status` reports env readiness for both Astra and HCD and selects the default env-backed backend (`astra` first, then `hcd`).
- `GET /api/astra-status` remains as a narrow legacy status surface for Astra-only readiness.

### Knowledge backends

Knowledge-backend resolution lives in `src/lib/knowledge/*`.

Options:

- connected backend (`astra` or `hcd`)
- `openrag`

Shared responsibilities:

- retrieval for chat
- document ingest/delete/load
- source discovery

Current capability differences:

- Connected Data API/HCD backends support vector, hybrid, and lexical search plus CSV and document ingest.
- OpenRAG supports vector search plus document ingest/delete/load, but not CSV ingest, lexical search, or hybrid search in this app.
- `GET /api/knowledge-backend-status` reports OpenRAG env readiness separately from the data backend.

### AI backend resolution

All AI work flows through `src/lib/ai/service.ts`.

Resolution order:

1. Manual Hugging Face key from the Connect dialog
2. `HUGGINGFACE_API_KEY` from the server environment
3. Local Ollama fallback

Default models:

- Hugging Face chat: `Qwen/Qwen2.5-Coder-32B-Instruct`
- Hugging Face embeddings: `ibm-granite/granite-embedding-125m-english`
- Ollama chat: `granite3.1-dense:8b`
- Ollama embeddings: `granite-embedding:278m`

`GET /api/ai-status` reports:

- whether an env Hugging Face key is configured
- whether Ollama is reachable
- the configured Ollama base URL
- whether the active Ollama chat and embedding models are already installed

If Ollama is active and a model is missing, `ensureModel` streams progress from Ollama's `/api/pull` endpoint into the app's `prepare` UI state.

## Frontend

Main composition:

- `src/app/page.tsx`
- `src/components/shell/Sidebar.tsx`
- `src/components/shell/PlaygroundMainPanel.tsx`
- `src/components/shell/PlaygroundDialogs.tsx`
- `src/components/connection/ConnectionDialog.tsx`
- `src/components/api/ApiExplorer.tsx`
- `src/components/chat/ChatArea.tsx`
- `src/components/ingest/IngestTab.tsx`

Top-level app state is composed in `src/lib/hooks/usePlaygroundState.ts`.

Current view ownership:

- `ChatArea` handles conversational search, streaming step updates, and assistant/source rendering
- `IngestTab` combines the upload queue, document library, raw collection browser, and document viewer
- `ApiExplorer` owns the request builder, generated SDK snippets, response pane, and TypeScript client-call activity log

Important state split:

- Data-backend connection and collection metadata live in `usePlaygroundConnection`
- Knowledge-backend mode (`connected` vs `openrag`) plus runtime OpenRAG credentials live in `usePlaygroundState`
- Conversations live in `useConversationState`
- Theme lives in `useThemeState`
- The manual Hugging Face key lives only in React state for the current page session
- Connection state can come from env-backed Data API or HCD credentials even when nothing is entered in the dialog

## Core Services

Backend adapters:

- `lib/backends/server.ts` resolves Data API/HCD env and runtime credentials
- `lib/dataApi/index.ts` resolves Data API/HCD adapters
- `lib/knowledge/index.ts` resolves connected/OpenRAG knowledge adapters

AI and chat:

- `lib/ai/service.ts` handles provider resolution, status checks, Ollama model prep, text generation, and embeddings
- `lib/chat/service.ts` orchestrates analyze -> embed -> search -> respond
- `lib/chat/search.ts` delegates retrieval to the resolved knowledge backend
- `lib/chat/response.ts` builds the final assistant answer

Collections and ingest:

- `lib/collections/service.ts` handles collection CRUD plus ingested-document operations
- `lib/ingest/service.ts` handles extraction, chunking, embedding, CSV ingest, and document ingest
- `lib/ingest/backend.ts` resolves ingest behavior against the active knowledge backend

## API Routes

Infrastructure:

- `/api/backend-status`
- `/api/astra-status`
- `/api/knowledge-backend-status`
- `/api/ai-status`
- `/api/auth/status`
- `/api/auth/login`
- `/api/auth/logout`

Core flows:

- `/api/connect`
- `/api/chat`
- `/api/conversations`
- `/api/conversations/[id]`
- `/api/conversations/[id]/messages`
- `/api/conversations/title`
- `/api/browse`
- `/api/count`
- `/api/documents`
- `/api/documents/chunks`
- `/api/ingest`
- `/api/ingest-document`
- `/api/create-collection`
- `/api/delete-collection`
- `/api/delete-documents`
- `/api/embedding-providers`
- `/api/keyspaces`
- `/api/data-api-proxy`
- `/api/typescript-client-calls`

`/api/connect` intentionally bounds its expensive metadata enrichment work:

- all collections are listed immediately
- best-effort counts and sampled field names are fetched for up to 12 non-internal collections
- additional collections return base metadata only so large backends do not turn connect into an unbounded fan-out

## Rate Limiting

- `POST /api/chat`: 20 requests per 60-second sliding window
- `POST /api/ingest`: 10 requests per 60-second sliding window
- `POST /api/ingest-document`: 10 requests per 60-second sliding window

The limiters are in-process memory and are not shared across workers or restarts. Client IP is resolved from `X-Forwarded-For` when present, falling back to a header fingerprint.

## Chat Pipeline

`POST /api/chat` streams newline-delimited JSON events.

Pipeline order:

1. `prepare`
   Optional. Emitted when Ollama checks or downloads a required local model.
2. `analyze`
   Uses the resolved chat model to interpret the user request and choose collection, mode, filters, and limits.
3. `embed`
   Generates a query embedding unless the target collection uses server-side vectorize.
4. `search`
   Delegates retrieval to the resolved knowledge backend.
5. `respond`
   Generates the final natural-language answer.

Additional behavior:

- `skipSearch` requests skip both embedding and search steps.
- Provider and model metadata are attached to `prepare`, `analyze`, `embed`, and `respond` completion events.
- Connected Astra vectorize collections continue to bypass client-side embedding.
- OpenRAG narrows the available search modes to vector search.

## Conversation Titles

`POST /api/conversations/title` uses the same AI resolution as chat, but remains best-effort:

- it does not auto-pull Ollama models
- it returns `{ title: null }` if generation fails
- it is intentionally non-blocking so conversation creation never depends on title generation

## Ingest

`src/lib/ingest/service.ts` handles both CSV and document ingest.

Behavior:

- CSV ingest batches rows into connected-backend writes and caps requests at 5,000 rows.
- Document ingest extracts text, chunks it, writes document metadata locally, and inserts chunk records into the active knowledge backend.
- Astra vectorize-enabled collections use `$vectorize`.
- Non-vectorize connected collections call the resolved AI backend for embeddings.
- Ollama model pulls emit `prepare` progress events.
- Non-vectorize ingest fails fast on provider errors.
- Non-vectorize ingest validates embedding dimensions against collection metadata when available.

Backend-specific behavior:

- CSV ingest is a connected knowledge-backend feature.
- OpenRAG ingest is document-only in this app.

There is no longer any random-vector fallback or silent insert-without-vectors path for connected ingest.

## Persistence

Stored locally in SQLite:

- conversations
- messages
- ingested document summaries

Stored in browser React state only:

- manual Data API or HCD credentials
- runtime OpenRAG credentials
- manual Hugging Face key
- open dialog state
- active view mode

Stored in browser `localStorage`:

- theme preference

## Environment Variables

See [.env.example](.env.example).

Key variables:

- `ASTRA_DB_APPLICATION_TOKEN`
- `ASTRA_DB_API_ENDPOINT`
- `ASTRA_DB_KEYSPACE`
- `HCD_DATA_API_ENDPOINT`
- `HCD_USERNAME`
- `HCD_PASSWORD`
- `HCD_KEYSPACE`
- `OPENRAG_API_KEY`
- `OPENRAG_URL`
- `HUGGINGFACE_API_KEY`
- `HUGGINGFACE_CHAT_MODEL`
- `HUGGINGFACE_EMBED_MODEL`
- `OLLAMA_BASE_URL`
- `OLLAMA_CHAT_MODEL`
- `OLLAMA_EMBED_MODEL`
- `PLAYGROUND_AUTH_PASSWORD`
- `PLAYGROUND_AUTH_SECRET`
- `PLAYGROUND_ALLOW_UNAUTHENTICATED`
- `DATA_API_PLAYGROUND_DB_PATH`

Important behavior:

- a manual Hugging Face key overrides `HUGGINGFACE_API_KEY` for the current page session only
- if both Astra and HCD env credentials exist, Astra becomes the default env-backed data backend
- OpenRAG readiness is tracked separately from the selected data backend
- if Hugging Face is selected but the key is invalid, the app returns the provider error and does not auto-fallback to Ollama
- if no Hugging Face key is available, the app resolves to Ollama automatically
- production fails closed unless password auth is configured or `PLAYGROUND_ALLOW_UNAUTHENTICATED=true` is set intentionally
