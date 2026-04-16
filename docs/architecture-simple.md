# Architecture — Simple Overview

Data API Playground is a **Next.js App Router app** that separates three backend concerns:

- **data backend**: Astra DB or DataStax HCD
- **knowledge backend**: the connected backend or OpenRAG
- **AI backend**: Hugging Face or local Ollama

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               Browser (React)                              │
│                                                                             │
│  Sidebar            Main Panel                  Dialog Layer                │
│  ─────────          ─────────────────────       ─────────────               │
│  Conversations      Chat / Ingest / API         Connection dialog           │
│  Collections        Document library            New collection              │
│  Keyspaces          Raw collection browser      Quick start                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                       Next.js route handlers (Node.js)
                                   │
       ┌──────────────────┬──────────────────────┬──────────────────────┐
       ▼                  ▼                      ▼                      ▼
  Data backend       Knowledge backend        AI backend           Local SQLite
  Astra or HCD       Connected or OpenRAG     HF or Ollama         conversations,
  connect/browse     search + doc flows       analyze/respond      messages, doc refs
  API Explorer
```

---

## Main Flows

### Chat

```
User question
    │
    ▼
Prepare?  → check or pull a required Ollama model
Analyze   → decide collection, mode, filters, limits
Embed     → create a vector unless server-side vectorize is active
Search    → query the active knowledge backend
Respond   → turn results into a concise answer
```

The UI receives streaming step events, so Output, Code, and Trace can update live.

### Ingest

```
Upload file or CSV rows
    │
    ▼
Extract / normalize text
    │
    ▼
Chunk and embed if needed
    │
    ▼
Insert into the active knowledge backend
    │
    ▼
Store document summary in local SQLite
```

### Collection Workspace

Pick a collection from the sidebar to open the ingest workspace, then use:

- the upload queue for CSV and document ingest
- the local document library for previously ingested files
- the raw collection browser for live Astra/HCD document inspection

### API Explorer

Switch to the API view to:

- run raw Data API requests against the active Astra/HCD collection
- compare generated TypeScript, Python, Java, and cURL snippets
- inspect the runtime client-call log side by side with the response

---

## Where State Lives

### React state

- active view mode
- current collection and conversation selection
- streaming chat state
- dialog open/close state
- manual Astra/HCD credentials
- knowledge backend mode plus optional runtime OpenRAG credentials
- optional manual Hugging Face key for the current page session

### Browser storage

- `localStorage`: theme preference

### Local SQLite

- conversations
- persisted messages
- ingested document summaries

### Backends

- Astra DB or HCD: user collections, browse/count, raw Data API operations
- Connected knowledge backend or OpenRAG: retrieval and stored document chunks

---

## Backend Boundaries

- **Data backend** powers connection, keyspaces, collection CRUD, raw browse, and API Explorer
- **Knowledge backend** powers search plus document ingest/delete/load
- **AI backend** powers analyze/respond plus client-side embeddings

Current important differences:

- Astra supports vectorize collections and embedding-provider discovery.
- HCD follows the same UI flow but lacks those Astra-specific capabilities.
- OpenRAG is currently vector-search and document-ingest oriented in this app.

---

## Architecture Shape

The app is organized into layers:

- **Routes**: request parsing, streaming responses, transport boundaries
- **Adapters and services**: data-backend, knowledge-backend, AI, chat, collection, and ingest logic
- **Hooks**: client-side orchestration for conversations, connection state, and feature flows
- **Components**: presentation and page/shell composition

That separation makes the app easier to change without every feature living in one giant file.
