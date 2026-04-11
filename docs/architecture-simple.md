# Architecture — Simple Overview

Data API Playground is a **Next.js app** for exploring Astra DB collections, uploading data, and asking natural-language questions over that data using either Hugging Face-hosted IBM Granite models or a local Ollama fallback.

---

## The Big Picture

```
┌────────────────────────────────────────────────────────────────────┐
│                        Browser (React)                             │
│                                                                    │
│  Sidebar            Main Panel                Dialog Layer         │
│  ─────────          ───────────────────       ─────────────        │
│  Conversations      Chat / Ingest / API       Connect dialog       │
│  Collections        Document library          New collection       │
│  Create collection  Raw collection browser    Quick start          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
                    Next.js API Routes
                    (server-side, Node.js)
                              │
       ┌────────────────┬─────────────────┬────────────────┬────────────────┐
       ▼                ▼                 ▼                ▼
  Astra DB        Hugging Face       Local Ollama   Local SQLite (`data/app.db`)
 (search + data)  (LLM + embed)      (LLM + embed)  conversations + messages +
                                                    ingested document summaries
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
Embed     → create a vector unless Astra server-side vectorize is active
Search    → query Astra DB
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
Insert into Astra DB
    │
    ▼
Store document summary in local SQLite
```

### Browse

Pick a collection from the sidebar and switch between:
- table-style output
- generated code examples
- raw collection/document inspection

---

## Where State Lives

### React state
- active view mode
- current collection and conversation selection
- streaming chat state
- dialog open/close state
- manual Astra credentials and optional manual Hugging Face key for the current page session

### Browser storage
- `localStorage`: theme preference

### Local SQLite
- conversations
- persisted messages
- ingested document summaries

### Astra DB
- user collections and documents
- vector or vectorize search data

---

## Architecture Shape

The app is now organized into layers:

- **Routes**: request parsing, streaming responses, transport boundaries
- **Services**: chat workflow, collection operations, ingest processing
- **Hooks**: client-side orchestration for conversations, connection state, and feature flows
- **Components**: presentation and page/shell composition

That separation makes the app easier to change without every feature living in one giant file.
