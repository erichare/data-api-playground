# Architecture — Simple Overview

Data API Playground is a **Next.js app** for exploring Astra DB collections, uploading data, and asking natural-language questions over that data with IBM Granite models.

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
│  Keyspace switch    Raw collection browser    Quick start          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
                    Next.js API Routes
                    (server-side, Node.js)
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
       Astra DB          IBM WatsonX        HuggingFace
    (search + data)    (LLM + embed)     (embed fallback)
                              │
                              ▼
                     Local SQLite (`data/app.db`)
                 conversations + message history +
                   ingested document summaries
```

---

## Main Flows

### Chat

```
User question
    │
    ▼
Analyze   → decide collection, mode, filters, limits
Embed     → create vector when needed
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

### Browser storage
- `sessionStorage`: Astra credentials and optional watsonx credentials for the current tab
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
