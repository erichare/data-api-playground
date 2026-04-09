# Data API Playground

An interactive web app for exploring [DataStax Astra DB](https://www.datastax.com/products/datastax-astra) via the Data API. Connect to your database, chat with your data, inspect the underlying API calls, and ingest tabular or document data from the browser.

## Highlights

- Demo mode or live Astra DB connection
- AI chat with a streaming pipeline trace
- Hugging Face when a key is available
- Local Ollama fallback when no Hugging Face key is configured
- CSV and document ingest with streaming progress
- Visible Ollama prepare and download steps during first-run model setup
- Automatic server-side `$vectorize` support for vectorize-enabled collections
- Persistent conversations and ingested-document metadata in local SQLite

## AI Backend Behavior

All AI work flows through a shared provider layer in `src/lib/ai/service.ts`.

Resolution order:

1. Manual Hugging Face key entered in the Connect dialog
2. `HUGGINGFACE_API_KEY` from the server environment
3. Local Ollama fallback

Default models:

- Hugging Face chat: `ibm-granite/granite-3.3-8b-instruct`
- Hugging Face embeddings: `ibm-granite/granite-embedding-125m-english`
- Ollama chat: `granite3.1-dense:8b`
- Ollama embeddings: `granite-embedding:278m`

The Connect dialog combines:

- Astra status from `/api/astra-status`
- AI backend status from `/api/ai-status`
- an optional manual Hugging Face key that lives in memory only for the current page session

When Ollama needs to pull a model, the chat and ingest UIs surface a dedicated `prepare` step so the first-run delay is obvious instead of looking like a stalled request.

## Getting Started

### Prerequisites

- Node.js 18+
- A [DataStax Astra DB](https://astra.datastax.com) account with an Application Token and API Endpoint
- Optional: a [Hugging Face](https://huggingface.co/) API key
- Optional: [Ollama](https://ollama.com/) running locally if you want the no-key fallback path

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env.local
```

Supported variables are documented in [.env.example](/Users/erichare/GitHub/data-api-playground/.env.example).

You can also enter credentials at runtime:

- Astra DB token and endpoint in the Connect dialog
- A manual Hugging Face key in the Connect dialog

The manual Hugging Face key is kept in memory only for the current page session.

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

## Usage

1. Connect to Astra DB with a token and endpoint.
2. Optionally add a Hugging Face key in the Connect dialog.
3. Chat with your collections and inspect the Output, Code, and Trace tabs.
4. Ingest CSV or document files into a collection.
5. If no Hugging Face key is available, make sure Ollama is running locally and let the app pull missing models on demand.

## Ingest Behavior

- Document uploads support PDF, TXT, MD, DOCX, CSV, and JSON files.
- Document uploads are capped at 50 MB per file.
- CSV ingest supports up to 5,000 rows per request.
- Collections using Astra server-side vectorize skip client-side embedding entirely.
- Non-vectorize collections use the resolved AI backend for embeddings.
- Embedding dimensions are validated against collection metadata when Astra exposes a dimension.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Database | DataStax Astra DB (`@datastax/astra-db-ts`) |
| AI | Hugging Face router or local Ollama |
| Storage | SQLite via `better-sqlite3` |

## Project Structure

```text
src/
  app/
    api/
      ai-status/
      astra-status/
      chat/
      conversations/
      ingest/
      ingest-document/
  components/
    chat/
    collection/
    connection/
    ingest/
    shell/
  lib/
    ai/
    astra.ts
    chat/
    ingest/
    hooks/
    server/
```

## Notes

- `POST /api/chat` streams `prepare`, `analyze`, `embed`, `search`, and `respond` events.
- `POST /api/conversations/title` is best-effort and returns `null` instead of blocking the UI if generation fails.
- If a Hugging Face key is present but invalid, the app returns the provider error and does not auto-fallback to Ollama.
- If Ollama is selected and a required model is missing, the app pulls it on demand and shows download progress in the UI.
- General API requests are capped at 10 MB, while ingest routes are allowed up to 50 MB.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e
```
