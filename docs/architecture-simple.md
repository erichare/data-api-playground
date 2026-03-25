# Architecture — Simple Overview

Data API Playground is a **Next.js app** that lets you chat with your Astra DB data using IBM Granite AI, browse and manage collections, and ingest CSV files.

---

## The Big Picture

```
┌────────────────────────────────────────────────────────────────────┐
│                        Browser (React)                             │
│                                                                    │
│  Sidebar          Main Panel               Ingest Panel           │
│  ─────────        ─────────────────────    ────────────────        │
│  Conversations    Chat / Browse toggle     CSV upload             │
│  Collections      ┌──────────────────┐    Collection picker      │
│                   │  Chat view        │    Progress bar           │
│                   │  - Messages       │                           │
│                   │  - Output tab     │                           │
│                   │  - Code tab       │                           │
│                   │  - Trace tab      │                           │
│                   └──────────────────┘                           │
│                   or                                              │
│                   ┌──────────────────┐                           │
│                   │  Browse view      │                           │
│                   │  - Output (table) │                           │
│                   │  - Code tab       │                           │
│                   └──────────────────┘                           │
└────────────────────────────────────────────────────────────────────┘
                              │
                    Next.js API Routes
                    (server-side, Node.js)
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
       Astra DB          IBM WatsonX        HuggingFace
    (vector search)    (LLM + embed)     (embed fallback)
```

---

## Two Views

### Chat View
Type a question. The app runs a 4-step AI pipeline and streams the result back in real time.

```
User question
    │
    ▼
① Analyze  →  What collection? What search mode? Any filters?
    │
    ▼
② Embed    →  Turn the question into a vector (768 dims)
    │
    ▼
③ Search   →  Query Astra DB with the vector + filters
    │
    ▼
④ Respond  →  Ask IBM Granite to summarize the results
    │
    ▼
Answer shown in Output tab
Code shown in Code tab
All 4 steps shown in Trace tab
```

### Browse View
Pick a collection from the sidebar. See all documents in a paginated table. Switch to the Code tab to see the exact `find()` call.

---

## Data Flows

| Action | Path |
|--------|------|
| Send chat message | Browser → `POST /api/chat` → Astra DB + WatsonX → streaming response |
| Browse collection | Browser → `POST /api/browse` → Astra DB → paginated documents |
| Ingest CSV | Browser → `POST /api/ingest` → WatsonX embed → Astra DB `insertMany` |
| New collection | Browser → `POST /api/create-collection` → Astra DB |
| Save conversation | Browser → `POST /api/conversations/[id]/messages` → Astra DB `dap_messages` |

---

## Where State Lives

```
React (in-memory)
├── Messages for the current conversation
├── Streaming pipeline steps (while chat is running)
└── UI state (active tab, which dialog is open, etc.)

sessionStorage (browser, cleared on tab close)
├── Astra DB token + endpoint
└── IBM WatsonX API key + project ID

localStorage (browser, persists)
└── Theme preference (dark / light)

Astra DB (permanent)
├── dap_conversations  — conversation list
└── dap_messages       — message history (excluding large result arrays)
```

---

## Key Design Decisions

- **Streaming first** — The chat pipeline uses Server-Sent Events (newline-delimited JSON) so the UI can show each step completing in real time, even before the final answer arrives.
- **No Redux / Zustand** — All app state lives in a single `usePlaygroundState()` hook. It's ~600 lines but straightforward to trace.
- **Credentials in session** — Token and API keys are stored in `sessionStorage` and sent in request headers. They are never written to the server or logged.
- **`dap_` prefix convention** — Internal Astra collections (`dap_conversations`, `dap_messages`) are filtered out of every user-facing dropdown so they don't appear as data collections.
- **IBM Carbon design system** — All colors come from CSS custom properties (`--bg-primary`, `--interactive`, etc.) that switch between dark and light palettes via a class on `<html>`. No hardcoded hex values in components.
