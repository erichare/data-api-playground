# Architecture

## Overview

The Data API Playground is a Next.js application for exploring Astra DB collections, ingesting data, and running a lightweight RAG workflow against Astra data.

All API routes run as Next.js route handlers in the Node.js runtime. The frontend is a single-page React app.

## Request Boundaries

- Browser clients talk only to this app's route handlers.
- Route handlers resolve Astra and AI credentials server-side before calling Astra, Hugging Face, or Ollama.
- Optional app-level auth is enforced in the proxy and route handlers through `requireApiAuth`.

Body-size limits are intentionally split:

- General API requests: 10 MB
- Ingest API requests: 50 MB
- Document upload validation: 50 MB per file

The Next.js proxy buffer, `src/proxy.ts`, and the document ingest validator all use aligned limits so multipart uploads are not truncated before the route can validate them.

## AI Provider Resolution

All AI work now flows through `src/lib/ai/service.ts`.

Resolution order:

1. Manual Hugging Face key from the Connect dialog
2. `HUGGINGFACE_API_KEY` from the server environment
3. Local Ollama fallback

Normalized operations:

- `resolveBackend({ huggingfaceApiKey })`
- `getAiStatus()`
- `ensureModel(kind)`
- `generateText(...)`
- `embedMany(...)`

Default models:

- Hugging Face chat: `ibm-granite/granite-3.3-8b-instruct`
- Hugging Face embeddings: `ibm-granite/granite-embedding-125m-english`
- Ollama chat: `granite3.1-dense:8b`
- Ollama embeddings: `granite-embedding:278m`

`GET /api/ai-status` reports:

- whether an env Hugging Face key is configured
- whether Ollama is reachable
- the configured Ollama base URL
- whether the active Ollama chat and embedding models are already installed

If Ollama is active and a model is missing, `ensureModel` can stream progress from `/api/pull` into the app's `prepare` UI state.

## Frontend

Main composition:

- `src/app/page.tsx`
- `src/components/shell/Sidebar.tsx`
- `src/components/shell/PlaygroundMainPanel.tsx`
- `src/components/connection/AstraConnectDialog.tsx`
- `src/components/chat/ChatArea.tsx`
- `src/components/ingest/IngestTab.tsx`

Top-level app state is composed in `src/lib/hooks/usePlaygroundState.ts`.

Important state split:

- Astra connection and collection metadata live in `usePlaygroundConnection`
- Conversations live in `useConversationState`
- The manual Hugging Face key lives only in React state for the current page session
- Connection state can come from env-backed Astra credentials even when no token is entered in the dialog

## API Routes

Infrastructure:

- `/api/astra-status`
- `/api/ai-status`

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

## Chat Pipeline

`POST /api/chat` streams newline-delimited JSON events.

Pipeline order:

1. `prepare`
   Optional. Emitted when Ollama checks or downloads a required local model.
2. `analyze`
   Uses the resolved chat model to interpret the user request and choose collection, mode, filters, and limits.
3. `embed`
   Generates a query embedding unless the target collection uses Astra server-side vectorize.
4. `search`
   Queries Astra with `$vector`, `$vectorize`, `$hybrid`, or lexical search.
5. `respond`
   Generates the final natural-language answer.

Additional behavior:

- Internal `dap_` collections are filtered out of AI collection selection.
- `skipSearch` requests skip both embedding and search steps.
- Provider and model metadata are attached to `prepare`, `analyze`, `embed`, and `respond` completion events.
- Collections with server-side vectorize continue to bypass client-side embedding.

## Conversation Titles

`POST /api/conversations/title` uses the same backend resolution as chat, but remains best-effort:

- it does not auto-pull Ollama models
- it returns `{ title: null }` if generation fails
- it is intentionally non-blocking so conversation creation never depends on title generation

## Ingest

`src/lib/ingest/service.ts` handles both CSV and document ingest.

Behavior:

- CSV ingest batches rows into Astra writes and caps requests at 5,000 rows.
- Document ingest extracts text, chunks it, writes document metadata locally, and inserts chunk records into Astra.
- Vectorize-enabled collections use `$vectorize`
- Non-vectorize collections call the resolved AI backend for embeddings
- Ollama model pulls emit `prepare` progress events
- Non-vectorize ingest now fails fast on provider errors
- Non-vectorize ingest validates embedding dimensions against collection metadata when available

There is no longer any random-vector fallback or silent insert-without-vectors path for connected ingest.

Upload constraints:

- supported document types: PDF, TXT, MD, DOCX, CSV, JSON
- maximum document upload size: 50 MB
- metadata payload cap: 16 KB
- extracted text cap: 1,000,000 characters
- maximum document chunks: 500

## Persistence

Stored locally in SQLite:

- conversations
- messages
- ingested document summaries

Stored in browser React state only:

- manual Hugging Face key
- open dialog state
- active view mode

Stored in in-memory connection state:

- Astra token and endpoint when entered through the Connect dialog
- env-backed Astra availability flags from `/api/astra-status`

## Environment Variables

See [.env.example](/Users/erichare/GitHub/data-api-playground/.env.example).

Key variables:

- `ASTRA_DB_APPLICATION_TOKEN`
- `ASTRA_DB_API_ENDPOINT`
- `HUGGINGFACE_API_KEY`
- `HUGGINGFACE_CHAT_MODEL`
- `HUGGINGFACE_EMBED_MODEL`
- `OLLAMA_BASE_URL`
- `OLLAMA_CHAT_MODEL`
- `OLLAMA_EMBED_MODEL`

Important behavior:

- a manual Hugging Face key overrides `HUGGINGFACE_API_KEY` for the current page session only
- if Hugging Face is selected but the key is invalid, the app returns the provider error and does not auto-fallback to Ollama
- if no Hugging Face key is available, the app resolves to Ollama automatically
