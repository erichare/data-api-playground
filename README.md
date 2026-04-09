# Data API Playground

An interactive web app for exploring [DataStax Astra DB](https://www.datastax.com/products/datastax-astra) via the Data API. Connect to your database, chat with your data, inspect the underlying API calls, and ingest tabular or document data from the browser.

## Highlights

- Demo mode or live Astra DB connection
- AI chat with a streaming pipeline trace
- Hugging Face when a key is available
- Local Ollama fallback when no Hugging Face key is configured
- CSV and document ingest with streaming progress
- Automatic server-side `$vectorize` support for vectorize-enabled collections
- Persistent conversations and ingested-document metadata in local SQLite

## AI Backend Behavior

The app now supports two AI backends:

1. Hugging Face
   Use `HUGGINGFACE_API_KEY` from the server environment, or enter a manual Hugging Face key in the Connect dialog for the current page session.
2. Ollama
   If no Hugging Face key is available, the app falls back to local Ollama.

Default models:

- Hugging Face chat: `ibm-granite/granite-3.3-8b-instruct`
- Hugging Face embeddings: `ibm-granite/granite-embedding-125m-english`
- Ollama chat: `granite3.1-dense:8b`
- Ollama embeddings: `granite-embedding:278m`

When Ollama needs to pull a model, the chat and ingest UIs surface a dedicated prepare/download step so the first-run delay is obvious.

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
    collections/
    ingest/
    hooks/
```

## Notes

- Collections using Astra server-side vectorize skip client-side embedding entirely.
- Non-vectorize collections use the resolved backend for embeddings.
- If a Hugging Face key is present but invalid, the app returns the provider error and does not auto-fallback to Ollama.
- If Ollama is selected and a required model is missing, the app pulls it on demand and shows download progress in the UI.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e
```
