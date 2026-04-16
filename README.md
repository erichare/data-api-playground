# Data API Playground

An interactive web app for exploring DataStax Data API backends across multiple backend combinations. Connect to the Data API or DataStax HCD, choose either the connected knowledge backend or OpenRAG, inspect the underlying API calls, and ingest tabular or document data from the browser.

<p align="center">
  <img src="docs/screenshots/01-chat-dark.png" alt="Data API Playground chat view with collection-aware answers and pipeline tabs" width="49%" />
  <img src="docs/screenshots/03-api-find-dark.png" alt="Data API Playground API explorer with generated request bodies and SDK snippets" width="49%" />
</p>

<p align="center"><em>Move between conversational exploration and API-first inspection without leaving the playground.</em></p>

## Highlights

- Demo mode or live backend connection
- Data backend support for the Data API and DataStax HCD
- Knowledge backend support for the connected backend or OpenRAG
- AI chat with a streaming pipeline trace
- API explorer with generated request bodies, SDK snippets, and a live TypeScript client-call log
- Hugging Face when a key is available
- Local Ollama fallback when no Hugging Face key is configured
- CSV and document ingest with streaming progress
- Ingest workspace with a local document library and raw collection browser
- Visible Ollama prepare and download steps during first-run model setup
- Automatic server-side `$vectorize` support for Astra vectorize-enabled collections
- Optional Astra CLI-backed Data API config discovery in the Connect dialog
- Import/export of connection config as YAML
- Persistent conversations and ingested-document metadata in local SQLite

## Backend Model

The app resolves three backend layers independently:

| Layer | Options | Used for |
|---|---|---|
| Data backend | `astra`, `hcd` | connect, keyspaces, collection CRUD, browse/count, API Explorer, raw Data API proxy |
| Knowledge backend | connected backend, `openrag` | search, document ingest/delete/load, collection-aware chat retrieval |
| AI backend | `huggingface`, `ollama` | query analysis, answer generation, client-side embeddings when server-side vectorize is unavailable |

Current capability notes:

- The Data API backend supports embedding-provider discovery and server-side `$vectorize` collections.
- DataStax HCD uses the same app surface for connect, browse, chat, and API exploration, but does not expose Astra-style embedding-provider discovery or vectorize collections.
- OpenRAG is available as an alternate knowledge backend for retrieval and document flows. In this app it supports vector search plus document ingest/delete/load, but not CSV row ingest, lexical search, or hybrid search.
- API Explorer, collection creation/deletion, keyspace discovery, and raw collection browsing remain data-backend features, so they continue to use the Data API or HCD even when OpenRAG is selected for knowledge retrieval.

## AI Backend Behavior

All AI work flows through a shared provider layer in `src/lib/ai/service.ts`.

Resolution order:

1. Manual Hugging Face key entered in the Connect dialog
2. `HUGGINGFACE_API_KEY` from the server environment
3. Local Ollama fallback

Default models:

- Hugging Face chat: `Qwen/Qwen2.5-Coder-32B-Instruct`
- Hugging Face embeddings: `ibm-granite/granite-embedding-125m-english`
- Ollama chat: `granite3.1-dense:8b`
- Ollama embeddings: `granite-embedding:278m`

The Connect dialog combines:

- data-backend status from `/api/backend-status`
- OpenRAG status from `/api/knowledge-backend-status`
- AI backend status from `/api/ai-status`
- an optional manual Hugging Face key that lives in memory only for the current page session

When Ollama needs to pull a model, the chat and ingest UIs surface a dedicated `prepare` step so the first-run delay is obvious instead of looking like a stalled request.

## Getting Started

### Prerequisites

- Node.js 20.9+
- One live data backend if you want real collection access:
  - The Data API with an Application Token and API Endpoint, or
  - DataStax HCD with endpoint, username, and password
- Optional: the `astra` CLI if you want the app to reuse local Astra profiles and database choices
- Optional: an OpenRAG deployment if you want to use `openrag` as the knowledge backend
- Optional: a Hugging Face API key
- Optional: Ollama running locally if you want the no-key fallback path

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env.local
```

Supported variables are documented in [`.env.example`](.env.example).

Important env-backed behavior:

- If both Data API and HCD env credentials are present, the app prefers the Data API as the default env-backed data connection.
- OpenRAG env credentials are discovered separately from the data backend and are available when you switch the knowledge backend mode to `openrag`.
- You only need to configure the backends you plan to use.

Production safety default:

- In `NODE_ENV=production`, the app requires `PLAYGROUND_AUTH_PASSWORD` and `PLAYGROUND_AUTH_SECRET` unless you explicitly set `PLAYGROUND_ALLOW_UNAUTHENTICATED=true`.
- `PLAYGROUND_AUTH_PASSWORD` accepts either a plaintext value or a bcrypt hash (for example `$2b$10$...`). Bcrypt hashes are recommended for production.
- In local development and tests, public access remains allowed by default.

You can also enter credentials at runtime:

- Data API token/endpoint or HCD endpoint/username/password in the Connect dialog
- Optional Astra CLI profile/database selection in the Connect dialog when `astra` is installed locally
- Optional OpenRAG API key and base URL in the Connect dialog when `openrag` knowledge mode is selected
- A manual Hugging Face key in the Connect dialog

Runtime credentials and the manual Hugging Face key are kept in memory only for the current page session.

The Connect dialog can also:

- export the current connection/model draft to `data-api-playground.config.yaml`
- import a previously exported YAML or JSON config file to prefill the dialog

If you select the Astra CLI mode, the app resolves the token and endpoint at runtime from the local `astra` profile and database you chose. If the CLI is not installed, the dialog falls back to the existing manual/environment behavior.

If you want to use the local fallback path, make sure Ollama is running:

```bash
ollama serve
```

The app can pull missing models on demand, but you can also pre-pull them:

```bash
ollama pull granite3.1-dense:8b
ollama pull granite-embedding:278m
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

Build the image:

```bash
docker build -t data-api-playground .
```

Run it with your env file and a persistent SQLite volume:

```bash
docker run --rm -p 3000:3000 \
  --env-file .env.local \
  -v "$(pwd)/data:/app/data" \
  data-api-playground
```

Then open [http://localhost:3000](http://localhost:3000).

Notes:

- The container stores SQLite data in `/app/data/app.db` by default.
- The bundled image does not install the `astra` CLI. Astra CLI-backed config is only available when the running environment already has the `astra` binary configured.

## Usage

1. Open the Connect dialog and choose a data backend: Data API or DataStax HCD.
2. Choose a knowledge backend mode:
   - `connected` to search the selected Data API/HCD backend
   - `openrag` to route retrieval and document flows through OpenRAG
3. Optionally add a manual Hugging Face key. Otherwise the app will use `HUGGINGFACE_API_KEY` from env or fall back to Ollama.
4. Chat with your collections and inspect the Output and Code tabs, and click pipeline step chips to expand details.
5. Use the ingest workspace to upload CSV or document files, inspect ingested documents, and browse raw collection records.
6. Switch to the API Explorer to run raw Data API requests and compare them with live TypeScript client calls.
7. If no Hugging Face key is available, make sure Ollama is running locally and let the app pull missing models on demand.

## Ingest Behavior

- Document uploads support PDF, TXT, MD, DOCX, CSV, XLSX, and JSON files.
- Document uploads are capped at 50 MB per file.
- CSV and XLSX uploads are chunked as one row per chunk.
- CSV ingest supports up to 5,000 rows per request.
- Connected Astra collections using server-side vectorize skip client-side embedding entirely.
- Connected non-vectorize collections use the resolved AI backend for embeddings.
- OpenRAG ingest is document-only in this app; CSV ingest remains a connected-backend capability.
- Embedding dimensions are validated against collection metadata when the active backend exposes a dimension.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Data backends | Data API (`@datastax/astra-db-ts`) and DataStax HCD |
| Knowledge backends | Connected Data API adapters and OpenRAG (`openrag-sdk`) |
| AI | Hugging Face router or local Ollama |
| Auth | `bcryptjs` (password hashing) + HMAC-SHA256 (sessions) |
| Storage | SQLite via `better-sqlite3` |

## Project Structure

```text
src/
  app/
    api/
      ai-status/          # AI backend availability
      astra-status/       # legacy Astra-only env status
      auth/               # login, logout, status
      backend-status/     # Data API/HCD env readiness + default backend
      browse/             # raw collection record browser
      chat/               # streaming RAG pipeline
      connect/            # Data API/HCD connection setup
      conversations/      # conversation CRUD + messages
      count/              # collection document counts
      create-collection/  # new collection creation
      data-api-config/    # optional Astra CLI discovery
      data-api-proxy/     # proxied Data API requests
      delete-collection/  # collection deletion
      delete-documents/   # document removal
      documents/          # ingested document metadata + chunks
      embedding-providers/# available Astra embedding providers
      ingest/             # CSV ingest with streaming progress
      ingest-document/    # document file ingest (PDF, DOCX, ...)
      keyspaces/          # keyspace listing
      knowledge-backend-status/ # OpenRAG env readiness
      sample-fields/      # collection field sampling
      typescript-client-calls/ # live client-call log
  components/
    api/                  # API Explorer panels and hooks
    auth/                 # login form
    chat/                 # message bubbles, pipeline trace, code tabs
    collection/           # collection management dialogs
    connection/           # backend/knowledge/AI connect dialog
    ingest/               # document upload and CSV ingest UI
    onboarding/           # quick-start guide
    shell/                # top-level layout, sidebar, header
    ui/                   # shadcn/Radix base components
  lib/
    ai/                   # provider abstraction (HF + Ollama)
    astra.ts              # Astra client wrapper
    backends/             # backend kinds, status, env resolution
    auth.ts               # HMAC session auth + bcrypt passwords
    chat/                 # RAG pipeline (search, response, service)
    collections/          # collection/document operations
    context/              # React context providers
    conversations/        # SQLite conversation persistence
    dataApi/              # Data API/HCD adapters
    db.ts                 # SQLite initialization
    hcd.ts                # HCD client wrapper
    hooks/                # global React state hooks
    ingest/               # document processing and chunking
    knowledge/            # Data API/HCD/OpenRAG retrieval adapters
    mock/                 # demo-mode mock data
    playground/           # client-side API wrapper
    server/               # server utilities (logging, request limits)
    validation/           # Zod schemas and parsing
```

## Rate Limiting

- `POST /api/chat` is rate-limited to 20 requests per 60-second sliding window per client IP.
- `POST /api/ingest` and `POST /api/ingest-document` are rate-limited to 10 requests per 60-second window per client IP.
- The limiters run in-process memory and reset on server restart. For production deployments behind a reverse proxy, ensure `X-Forwarded-For` is set by a trusted layer.

## Demo Mode

When no Data API/HCD credentials are configured, the app runs in demo mode for connected-backend features:

- Chat responses use only the AI backend with no database search
- Connected-backend ingest creates local metadata records in SQLite but does not write to the Data API/HCD
- The document library, raw collection browser, and conversation history remain fully functional
- The API Explorer shows generated request/response shapes without executing live calls

Demo mode is useful for exploring the UI, testing AI backends, and understanding the pipeline before connecting to a live backend.

## Notes

- `POST /api/chat` streams `prepare`, `analyze`, `embed`, `search`, and `respond` events.
- `POST /api/conversations/title` is best-effort and returns `null` instead of blocking the UI if generation fails.
- If a Hugging Face key is present but invalid, the app returns the provider error and does not auto-fallback to Ollama.
- If Ollama is selected and a required model is missing, the app pulls it on demand and shows download progress in the UI.
- If `openrag` knowledge mode is selected, available search modes and ingest actions are narrowed to that backend's capabilities.
- `POST /api/embedding-providers` and server-side `$vectorize` collection creation are Data API-only features.
- General API requests are capped at 10 MB, while ingest routes are allowed up to 50 MB.
- Auth sessions expire after 12 hours.
- Production deployments fail closed unless password auth is configured or `PLAYGROUND_ALLOW_UNAUTHENTICATED=true` is set intentionally.
- On connect, the app samples metadata (estimated count plus field names) for up to 12 collections. Large backends may not show counts for every collection.
- Ingested documents are tracked with a `content_hash` (SHA-256 of the raw file bytes). Re-uploading the same file to the same collection is skipped as a duplicate.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:coverage
npm run test:e2e
npm run check:openapi
```
