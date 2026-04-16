# Data API Playground

An interactive web app for exploring DataStax and Langflow backends from one place. Choose Data API, DataStax HCD, or OpenRAG in the Backend dialog, inspect the underlying API calls when a Data API backend is active, and ingest tabular or document data from the browser.

<p align="center">
  <img src="docs/screenshots/01-chat-dark.png" alt="Data API Playground chat view with collection-aware answers and pipeline tabs" width="49%" />
  <img src="docs/screenshots/03-api-find-dark.png" alt="Data API Playground API explorer with generated request bodies and SDK snippets" width="49%" />
</p>

<p align="center"><em>Move between conversational exploration and API-first inspection without leaving the playground.</em></p>

## Highlights

- Demo mode or live backend connection
- Top-level backend choices for Data API, DataStax HCD, and OpenRAG
- AI chat with a streaming pipeline trace
- API explorer with generated request bodies, SDK snippets, and a live TypeScript client-call log
- Hugging Face when a key is available
- Local Ollama fallback when no Hugging Face key is configured
- CSV and document ingest with streaming progress
- Ingest workspace with a local document library and raw collection browser
- Visible Ollama prepare and download steps during first-run model setup
- Automatic server-side `$vectorize` support for Astra vectorize-enabled collections
- Optional Astra CLI-backed Data API config discovery in the Backend dialog, defaulting to CLI mode when it is installed and already configured
- Import/export of backend config as YAML, with YAML or JSON import support
- OpenRAG mode hides Data API-specific collections and API explorer surfaces
- Persistent conversations and backend-scoped ingested-document metadata in local SQLite

## Backend Model

The dialog exposes three top-level backend choices:

| Backend | Provider | Used for | Notes |
|---|---|---|---|
| `Data API` | DataStax | connect, keyspaces, collection CRUD, browse/count, API Explorer, raw Data API proxy, connected retrieval | supports embedding-provider discovery and server-side `$vectorize` collections |
| `HCD` | DataStax | connect, keyspaces, collection CRUD, browse/count, API Explorer, raw collection browsing, connected retrieval | shares the same shell as Data API, but without Astra-only embedding-provider discovery or vectorize collections |
| `OpenRAG` | Langflow | chat retrieval plus document ingest/delete/load | hides the collections sidebar, collection CRUD, API Explorer, and raw collection browser; CSV ingest is unavailable |

Current capability notes:

- Under the hood, the app still tracks a data backend (`astra` or `hcd`) plus a knowledge backend mode (`connected` or `openrag`).
- Selecting OpenRAG promotes it to a first-class choice in the UI, but it only takes over retrieval and document flows.
- Data-only surfaces stay tied to the selected Data API or HCD backend and are hidden while OpenRAG is active.
- OpenRAG supports vector search plus document ingest/delete/load, but not CSV row ingest, lexical search, or hybrid search.

## AI Backend Behavior

All AI work flows through a shared provider layer in `src/lib/ai/service.ts`.

Resolution order:

1. Manual Hugging Face key entered in the Backend dialog
2. `HUGGINGFACE_API_KEY` from the server environment
3. Local Ollama fallback

Default models:

- Hugging Face chat: `Qwen/Qwen2.5-Coder-32B-Instruct`
- Hugging Face embeddings: `ibm-granite/granite-embedding-125m-english`
- Ollama chat: `granite3.1-dense:8b`
- Ollama embeddings: `granite-embedding:278m`

The Backend dialog combines:

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
- Optional: an OpenRAG deployment if you want to use OpenRAG as a backend option
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
- OpenRAG env credentials are discovered separately from the data backend and are available when you choose OpenRAG in the Backend dialog.
- You only need to configure the backends you plan to use.

Production safety default:

- In `NODE_ENV=production`, the app requires `PLAYGROUND_AUTH_PASSWORD` and `PLAYGROUND_AUTH_SECRET` unless you explicitly set `PLAYGROUND_ALLOW_UNAUTHENTICATED=true`.
- `PLAYGROUND_AUTH_PASSWORD` accepts either a plaintext value or a bcrypt hash (for example `$2b$10$...`). Bcrypt hashes are recommended for production.
- In local development and tests, public access remains allowed by default.

You can also enter credentials at runtime:

- Data API token/endpoint or HCD endpoint/username/password in the Backend dialog
- Optional Astra CLI profile/database selection in the Backend dialog when `astra` is installed locally
- Optional OpenRAG API key and base URL in the Backend dialog when OpenRAG is selected
- A manual Hugging Face key in the Backend dialog

Runtime credentials and the manual Hugging Face key are kept in memory only for the current page session.

The Backend dialog can also:

- export the current connection/model draft to `data-api-playground.config.yaml`
- import a previously exported YAML or JSON config file to prefill the dialog

If the `astra` CLI is installed, already configured, and has a selected profile with databases, the Data API form defaults to Astra CLI mode. In that mode the app resolves the token and endpoint at runtime from the local `astra` profile and database you chose. If the CLI is not installed, the dialog falls back to the existing manual/environment behavior.

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

1. Open the Backend dialog and choose one of the three top-level backends: Data API, HCD, or OpenRAG.
2. For Data API, use either manual credentials, env credentials, or Astra CLI. If `astra` is installed and already configured with a selected database, the dialog defaults to Astra CLI mode.
3. For HCD, use either manual endpoint/username/password credentials or env credentials.
4. For OpenRAG, use either manual API key/base URL credentials or env credentials. In this mode the collections sidebar, collection CRUD, API Explorer, and raw collection browser stay hidden because they are Data API/HCD-specific surfaces.
5. Optionally add a manual Hugging Face key. Otherwise the app uses `HUGGINGFACE_API_KEY` from env or falls back to Ollama.
6. Chat with your collections and inspect the Output and Code tabs, and click pipeline step chips to expand details.
7. Use the ingest workspace to upload files and inspect ingested documents. CSV ingest is available only for Data API and HCD; OpenRAG is document-only in this app.
8. When using Data API or HCD, switch to the API Explorer to run raw Data API requests and compare them with live TypeScript client calls.
9. If no Hugging Face key is available, make sure Ollama is running locally and let the app pull missing models on demand.

## Ingest Behavior

- Document uploads support PDF, TXT, MD, DOCX, CSV, XLSX, and JSON files.
- Document uploads are capped at 50 MB per file.
- CSV and XLSX uploads are chunked as one row per chunk.
- CSV ingest supports up to 5,000 rows per request.
- Connected Astra collections using server-side vectorize skip client-side embedding entirely.
- Connected non-vectorize collections use the resolved AI backend for embeddings.
- OpenRAG ingest is document-only in this app; CSV ingest remains a connected-backend capability.
- Embedding dimensions are validated against collection metadata when the active backend exposes a dimension.
- The document library is scoped to the active backend and connection details, so Data API, HCD, and OpenRAG ingests stay separated.

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
    connection/           # backend and model configuration dialog
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
- The document library and conversation history remain fully functional, and the raw collection browser remains available in Data API/HCD modes
- The API Explorer shows generated request/response shapes without executing live calls

Demo mode is useful for exploring the UI, testing AI backends, and understanding the pipeline before connecting to a live backend.

If OpenRAG credentials are present, OpenRAG can still run live even while Data API/HCD features stay in demo mode.

## Notes

- `POST /api/chat` streams `prepare`, `analyze`, `embed`, `search`, and `respond` events.
- `POST /api/conversations/title` is best-effort and returns `null` instead of blocking the UI if generation fails.
- If a Hugging Face key is present but invalid, the app returns the provider error and does not auto-fallback to Ollama.
- If Ollama is selected and a required model is missing, the app pulls it on demand and shows download progress in the UI.
- If OpenRAG is selected in the Backend dialog, available search modes and ingest actions are narrowed to that backend's capabilities.
- `POST /api/embedding-providers` and server-side `$vectorize` collection creation are Data API-only features.
- General API requests are capped at 10 MB, while ingest routes are allowed up to 50 MB.
- Auth sessions expire after 12 hours.
- Production deployments fail closed unless password auth is configured or `PLAYGROUND_ALLOW_UNAUTHENTICATED=true` is set intentionally.
- On connect, the app samples metadata (estimated count plus field names) for up to 12 collections. Large backends may not show counts for every collection.
- Ingested documents are tracked with a `content_hash` (SHA-256 of the raw file bytes). Re-uploading the same file to the same collection is skipped as a duplicate.
- Ingested-document history is stored with backend scope, so switching from Astra or HCD to OpenRAG does not mix document libraries together.

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
