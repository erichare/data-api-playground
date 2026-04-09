# Architecture

## Overview

The Data API Playground is a Next.js application for exploring Astra DB collections, ingesting data, and running a lightweight RAG workflow against Astra data.

All API routes run as Next.js route handlers in the Node.js runtime. The frontend is a single-page React app.

## AI Provider Resolution

All AI work now flows through `src/lib/ai/service.ts`.

Resolution order:

1. Manual Hugging Face key from the Connect dialog
2. `HUGGINGFACE_API_KEY` from the server environment
3. Local Ollama fallback

Normalized operations:

- `resolveBackend({ huggingfaceApiKey })`
- `ensureModel(kind)`
- `generateText(...)`
- `embedMany(...)`

Default models:

- Hugging Face chat: `ibm-granite/granite-3.3-8b-instruct`
- Hugging Face embeddings: `ibm-granite/granite-embedding-125m-english`
- Ollama chat: `granite3.1-dense:8b`
- Ollama embeddings: `granite-embedding:278m`

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

## API Routes

Infrastructure:

- `/api/astra-status`
- `/api/ai-status`

Core flows:

- `/api/connect`
- `/api/chat`
- `/api/conversations/title`
- `/api/ingest`
- `/api/ingest-document`

## Chat Pipeline

`POST /api/chat` streams newline-delimited JSON events.

Pipeline order:

1. `prepare`
   Optional. Emitted when Ollama checks or downloads a required local model.
2. `analyze`
   Interprets the user request and chooses collection, mode, filters, and limits.
3. `embed`
   Generates a query embedding unless the target collection uses Astra server-side vectorize.
4. `search`
   Queries Astra with `$vector`, `$vectorize`, `$hybrid`, or lexical search.
5. `respond`
   Generates the final natural-language answer.

Collections with server-side vectorize continue to bypass client-side embedding.

## Ingest

`src/lib/ingest/service.ts` handles both CSV and document ingest.

Behavior:

- Vectorize-enabled collections use `$vectorize`
- Non-vectorize collections call the resolved AI backend for embeddings
- Ollama model pulls emit `prepare` progress events
- Non-vectorize ingest now fails fast on provider errors
- Non-vectorize ingest validates embedding dimensions against collection metadata when available

There is no longer any random-vector fallback or silent insert-without-vectors path for connected ingest.

## Persistence

Stored locally in SQLite:

- conversations
- messages
- ingested document summaries

Stored in browser React state only:

- manual Hugging Face key
- open dialog state
- active view mode

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
