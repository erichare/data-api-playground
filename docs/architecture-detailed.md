# Architecture — Detailed Reference

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [Frontend Architecture](#2-frontend-architecture)
3. [State Management](#3-state-management)
4. [Theme System](#4-theme-system)
5. [Component Hierarchy](#5-component-hierarchy)
6. [API Routes](#6-api-routes)
7. [AI Chat Pipeline](#7-ai-chat-pipeline)
8. [Streaming Protocol](#8-streaming-protocol)
9. [Persistence Model](#9-persistence-model)
10. [Type System](#10-type-system)
11. [External Service Integration](#11-external-service-integration)

---

## 1. Repository Layout

```
src/
├── app/
│   ├── api/                          # Next.js route handlers (Node.js runtime)
│   │   ├── chat/route.ts             # 4-step streaming RAG pipeline
│   │   ├── connect/route.ts          # Validate credentials, discover collections
│   │   ├── browse/route.ts           # Paginated document fetch
│   │   ├── ingest/route.ts           # CSV → embed → insertMany (streaming)
│   │   ├── create-collection/        # db.createCollection()
│   │   ├── delete-collection/        # db.dropCollection()
│   │   ├── delete-documents/         # collection.deleteMany()
│   │   ├── count/route.ts            # estimatedDocumentCount()
│   │   ├── keyspaces/route.ts        # List available keyspaces
│   │   ├── embedding-providers/      # List $vectorize providers
│   │   ├── astra-status/route.ts     # Check ASTRA_DB env vars
│   │   ├── watsonx-status/route.ts   # Check WATSONX env vars
│   │   └── conversations/
│   │       ├── route.ts              # GET list / POST create
│   │       └── [id]/
│   │           ├── route.ts          # PATCH rename / DELETE
│   │           └── messages/route.ts # GET load / POST append
│   ├── globals.css                   # CSS variable theme (dark + light)
│   ├── layout.tsx                    # Root HTML, font imports
│   └── page.tsx                      # App shell, modal routing
│
├── components/
│   ├── shell/
│   │   ├── Header.tsx                # Logo, IBM badge, connection status, theme toggle
│   │   └── Sidebar.tsx               # Collapsible sidebar, conversations, collections
│   ├── chat/
│   │   ├── ChatArea.tsx              # Input, streaming, message list
│   │   ├── MessageBubble.tsx         # Output/Code/Trace tabs per message
│   │   ├── PipelineTrace.tsx         # Step-by-step pipeline visualization
│   │   ├── SearchModeToggle.tsx      # Vector / Hybrid / Lexical pill selector
│   │   ├── SourceCard.tsx            # Retrieved document card
│   │   └── TypingIndicator.tsx       # Animated 3-dot indicator
│   ├── collection/
│   │   ├── CollectionViewer.tsx      # Document table, Output/Code tabs, pagination
│   │   ├── IngestPanel.tsx           # CSV upload, progress, 4-language code panel
│   │   ├── NewCollectionDialog.tsx   # Create collection form with live code preview
│   │   └── DeleteCollectionDialog.tsx # Confirmation + SDK code snippet
│   ├── connection/
│   │   └── AstraConnectDialog.tsx    # Token, endpoint, WatsonX key inputs
│   ├── onboarding/
│   │   └── QuickStartGuide.tsx       # 5-step code guide (Python/TS/Java/cURL)
│   └── ui/                           # shadcn/ui components (Button, Tooltip, etc.)
│
└── lib/
    ├── types.ts                      # All shared TypeScript interfaces
    ├── astra.ts                      # DataAPIClient factory + SYSTEM_FIELDS list
    ├── utils.ts                      # cn() and other utilities
    ├── hooks/
    │   └── usePlaygroundState.ts     # Single master state hook (~600 lines)
    └── mock/
        ├── data.ts                   # Demo collections, documents, conversations
        └── hints.ts                  # AI query hint suggestions
```

---

## 2. Frontend Architecture

The app is a **single-page React application** rendered by Next.js App Router. There is no client-side routing — every view is controlled by `viewMode` state in `usePlaygroundState`.

```
page.tsx (shell)
├── Header                   — always visible
├── Sidebar                  — collapsible, left
├── Main Panel               — flex-1, center
│   ├── View Mode Toggle     — Chat | Browse, always visible at top
│   └── Content Area
│       ├── ChatArea         — when viewMode === "chat"
│       └── CollectionViewer — when viewMode === "browse" && collection selected
├── IngestPanel              — collapsible, right
└── Modal Layer (AnimatePresence)
    ├── Landing Screen       — when !connected && !demoAccepted
    ├── AstraConnectDialog   — connectDialogOpen
    ├── NewCollectionDialog  — newCollectionOpen
    ├── DeleteCollectionDialog — deleteCollectionTarget !== null
    └── QuickStartGuide      — quickStartOpen
```

### Rendering Notes

- **No SSR for app shell** — `page.tsx` is a client component (`"use client"`). Initial render shows a loading gate until `initializing` resolves.
- **Framer Motion** — Used for sidebar collapse animation, modal enter/exit (`AnimatePresence`), and tab content transitions.
- **Tailwind CSS** — Utility classes handle layout and spacing. Colors come exclusively from CSS variables.

---

## 3. State Management

All application state lives in `usePlaygroundState()` (`src/lib/hooks/usePlaygroundState.ts`). This hook is instantiated once in `page.tsx` and its values are passed as props to all components.

### State Categories

#### Connection
```ts
astraToken: string           // Resolved token (env var or user-entered)
astraEndpoint: string        // Resolved endpoint
astraFromEnv: boolean        // Whether creds came from env vars
ibmApiKey: string            // WatsonX API key
watsonxProjectId: string     // WatsonX project ID
envReady: boolean            // Whether env vars are configured
isConnected: boolean         // Derived: !!astraToken
initializing: boolean        // True during initial session restore
```

#### UI
```ts
viewMode: "chat" | "browse"
theme: "dark" | "light"
connectDialogOpen: boolean
newCollectionOpen: boolean
quickStartOpen: boolean
ingestCollapsed: boolean
```

#### Collections
```ts
collections: Collection[]
collectionFields: Record<string, string[]>   // field names sampled per collection
activeCollection: string
activeCollectionObj: Collection | undefined
keyspaces: string[]
selectedKeyspace: string
```

#### Conversations
```ts
conversations: Conversation[]
activeConversationId: string
messages: Message[]          // Derived: activeConversation.messages
creatingConversation: boolean
```

### Persistence Tracking

Two `useRef` sets prevent duplicate API calls:
- `persistedMessageIds` — tracks which message IDs have already been saved to Astra
- `loadedConvIds` — tracks which conversation IDs have had their messages loaded

Messages are lazily loaded: when switching to a conversation, `loadConversationMessages()` fetches its messages from `/api/conversations/[id]/messages` only once.

---

## 4. Theme System

The theme is implemented entirely via **CSS custom properties** defined in `globals.css`. A `dark` class on `<html>` switches between the two palettes.

### CSS Variables

| Variable | Dark | Light | Usage |
|----------|------|-------|-------|
| `--bg-primary` | `#161616` | `#f4f4f4` | Page background |
| `--bg-panel` | `#262626` | `#ffffff` | Sidebar, header, cards |
| `--bg-card` | `#303030` | `#ffffff` | Message bubbles, dialog body |
| `--bg-input` | `#393939` | `#f4f4f4` | Input fields |
| `--bg-hover` | `#353535` | `#e8e8e8` | Hover states |
| `--border-subtle` | `#3d3d3d` | `#e0e0e0` | Dividers, card borders |
| `--border-strong` | `#525252` | `#8d8d8d` | Focus rings |
| `--text-primary` | `#f4f4f4` | `#161616` | Body text |
| `--text-secondary` | `#c6c6c6` | `#525252` | Labels, metadata |
| `--text-muted` | `#8d8d8d` | `#8d8d8d` | Placeholders, hints |
| `--interactive` | `#4589ff` | `#0f62fe` | Buttons, active tabs, links |
| `--interactive-light` | `rgba(69,137,255,.12)` | `rgba(15,98,254,.08)` | Active tab background |
| `--interactive-border` | `rgba(69,137,255,.3)` | `rgba(15,98,254,.2)` | Active tab border |

### Pipeline Step Colors (Both Themes)

| Variable | Value | Step |
|----------|-------|------|
| `--step-analyze` | `#6c63ff` | Analyze Query (purple) |
| `--step-embed` | `#00c2cb` | Embed with Granite (cyan) |
| `--step-search` | `#ff6b35` | Search Astra DB (orange) |
| `--step-respond` | `#22c55e` | Generate Response (green) |

### Fonts

```css
--font-sans: IBM Plex Sans (300/400/500/600/700)
--font-mono: IBM Plex Mono (400/500)
```

All code blocks, embedding previews, and inline identifiers use `IBM Plex Mono`.

---

## 5. Component Hierarchy

### ChatArea → MessageBubble → PipelineTrace

```
ChatArea
├── Messages container (flex-1 min-h-0 overflow-y-auto)
│   ├── EmptyState (when no messages)
│   └── MessageBubble[] (one per message)
│       ├── User bubble (right-aligned, --interactive background)
│       └── Assistant bubble
│           ├── Tab bar: Output | Code | Trace
│           │   (Code only shown if hasSearchCode)
│           │   (Trace only shown if hasPipelineSteps)
│           ├── Output tab
│           │   └── ReactMarkdown (answer text + latency badge)
│           ├── Code tab
│           │   └── CodeTab (TS/Python/Java/cURL + copy button)
│           └── Trace tab
│               └── PipelineTrace
│                   ├── Header (total latency)
│                   └── StepRow[] (Analyze, Embed, Search, Respond)
│                       ├── Status icon (spinner/check/skip/error)
│                       ├── Step name + latency
│                       └── StepDataPreview (expandable)
│                           ├── Analyze: JSON of parsed parameters
│                           ├── Embed: vector preview + dims + model
│                           ├── Search: Output/Code sub-tabs
│                           │   ├── Output: retrieved document cards
│                           │   └── Code: TS/Python/Java/cURL command
│                           └── Respond: (shown in main Output tab)
├── TypingIndicator (when isStreaming)
└── Bottom bar
    ├── SearchModeToggle (Vector | Hybrid | Lexical)
    └── Textarea + Send button
```

### CollectionViewer

```
CollectionViewer
├── Header row
│   ├── Collection name + vector dims badge
│   ├── Doc count
│   ├── Refresh button
│   ├── Export CSV button
│   └── "Ask about this data" button (switches to Chat)
├── Tab bar: Output | Code
├── Output tab
│   ├── Selection toolbar (Delete selected)
│   ├── Document table
│   │   ├── Checkbox column
│   │   ├── Expand row button
│   │   └── Auto-detected field columns (sortable)
│   └── Pagination bar (page N of M, prev/next)
└── Code tab
    └── BrowseCodePanel (TS/Python/Java/cURL + copy)
```

### IngestPanel

```
IngestPanel (collapsible right panel)
├── Header (Ingest Data + Upload CSV button)
├── Drop zone (CSV drag-and-drop)
├── Target Collection selector (dap_* filtered out)
├── Embedding info badge
├── Start Ingestion button
└── Progress (when running)
    ├── Progress bar (processedRows / totalRows)
    └── Status text
```

---

## 6. API Routes

All routes use `export const runtime = "nodejs"` (no edge runtime).

### POST /api/chat

The main pipeline. Accepts JSON, returns `text/plain` streaming NDJSON.

**Request:**
```ts
{
  query: string
  searchMode: "vector" | "hybrid" | "lexical"
  token: string
  endpoint: string
  collections: Collection[]
  activeCollection: string
  ibmApiKey?: string
  watsonxProjectId?: string
  collectionFields?: string[]
  history: { role: "user" | "assistant"; content: string }[]
}
```

**Response:** newline-delimited JSON events (see [Streaming Protocol](#8-streaming-protocol))

### POST /api/connect

Validates credentials and discovers collections.

**Request:** `{ token, endpoint, keyspace? }`
**Response:** `{ collections: Collection[], fields: Record<string, string[]>, token, endpoint }`

Fields are sampled by fetching the first 3 documents of each collection and collecting their non-system keys.

### POST /api/browse

**Request:** `{ token, endpoint, collection, pageState?, sort? }`
**Response:** `{ documents: CollectionDocument[], nextPageState: string | null }`

Uses cursor-based pagination via `astra-db-ts` `.find().toArray()` with `pageState` option.

### POST /api/ingest

Streaming CSV ingestion. Returns `text/plain` NDJSON.

**Request:** `{ token, endpoint, collection, rows: Record<string, string>[], filename }`
**Events:**
```jsonc
{ "type": "start", "total": 150 }
{ "type": "progress", "processed": 50 }
{ "type": "complete", "processed": 150 }
{ "type": "error", "error": "..." }
```

**Embedding logic:**
- If collection has `vectorizeService`: use `$vectorize` field, Astra handles embedding
- Otherwise: batch embed via WatsonX → HuggingFace fallback → random fallback
- Batch size: 20 rows per `insertMany` call

### POST /api/create-collection

**Request:** `{ token, endpoint, name, dimension, metric, provider, model }`
**Response:** `{ collection: Collection }`

If `provider !== "none"`, creates with `vector.service = { provider, modelName: model }`.

### Conversation Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/conversations` | GET | List all, sorted by `updatedAt DESC` |
| `/api/conversations` | POST | Create with auto-generated name |
| `/api/conversations/[id]` | PATCH | Rename |
| `/api/conversations/[id]` | DELETE | Delete conversation + messages |
| `/api/conversations/[id]/messages` | GET | Load up to 500 messages, sorted by timestamp ASC |
| `/api/conversations/[id]/messages` | POST | Append message, update conversation metadata |

Messages are stored in the `dap_messages` collection with fields: `id`, `conversationId`, `role`, `content`, `timestamp`, `searchMode`, `latencyMs`, `pipelineSteps`, `sources`.

**Note:** When persisting a `search` pipeline step, the `results` array is dropped and replaced with `resultCount` to avoid storing large payloads in Astra. The full results are only available in the in-memory session.

---

## 7. AI Chat Pipeline

### Step 1 — Analyze

Uses `ibm/granite-3-8b-instruct` via `WatsonxAI.textChat()`.

The prompt includes:
- User query
- List of available collection names
- Known field names for the active collection
- Conversation history (last 10 turns)

The model returns a JSON object:
```ts
{
  collection: string        // Which collection to search
  searchMode: string        // "vector" | "hybrid" | "lexical"
  intent: string            // Cleaned version of the query
  limit: number             // How many results to fetch
  sortField: string | null  // Sort by this field instead of vector
  sortDir: "asc" | "desc" | null
  filterField: string | null
  filterOp: "$eq" | "$gt" | "$lt" | "$gte" | "$lte" | null
  filterValue: string | null
  skipSearch: boolean       // True for conversational/greeting queries
}
```

### Step 2 — Embed

If `skipSearch` is true, this step is skipped.

If the target collection has a `vectorizeService`, this step is also skipped — Astra handles embedding via `$vectorize`.

Otherwise:
1. Call `WatsonxAI.textEmbedding({ model_id: "ibm/slate-125m-english-rtrvr-v2", input: [intent] })`
2. Fallback: `POST https://api-inference.huggingface.co/models/ibm/granite-embedding-125m-english`
3. Final fallback: `Array.from({ length: 768 }, Math.random)`

Output: `float32[]` vector (768 dims), streamed with a preview of first 8 values.

### Step 3 — Search

Builds the Astra DB query based on Analyze output:

```ts
// Sort field specified → field sort (no vector needed)
collection.find(filter, { sort: { [sortField]: sortDir === "desc" ? -1 : 1 }, limit })

// Vector collection, no $vectorize
collection.find(filter, { sort: { $vector: embedding }, limit, includeSimilarity: true })

// $vectorize collection, hybrid mode
collection.findAndRerank(filter, { sort: { $hybrid: { $vectorize: intent } }, limit })

// $vectorize collection, vector/lexical mode
collection.find(filter, { sort: { $vectorize: intent }, limit })
```

If a filter is applied and the query fails (field not filterable), it retries without the filter.

Results are mapped to `SearchResult[]`:
```ts
type SearchResult = {
  id: string
  similarity: number
  preview: Record<string, string | number>  // non-system fields, first 5
}
```

### Step 4 — Respond

Constructs a context string from search results:
```
[1] field1: value1 | field2: value2 | similarity: 0.92
[2] field1: value3 | field2: value4 | similarity: 0.88
...
```

Calls `WatsonxAI.textChat()` with:
- System prompt instructing concise, data-focused responses
- Full conversation history
- Search results as context

Streams the response content and emits the final `respond.complete` event.

---

## 8. Streaming Protocol

`POST /api/chat` uses a `TransformStream` to write newline-delimited JSON events.

Each event shape:
```ts
type PipelineEvent = {
  step: "analyze" | "embed" | "search" | "respond"
  status: "running" | "complete" | "error" | "skipped"
  latencyMs?: number
  data?: Record<string, unknown>
}
```

### Client-Side Handling (ChatArea.tsx)

```ts
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    const event = JSON.parse(line);
    upsertStep({ id: event.step, status: event.status, latencyMs: event.latencyMs, data: event.data });
    setStreamingSteps([...liveSteps]);  // triggers re-render of PipelineTrace
  }
}
```

`upsertStep()` merges incoming events into the `liveSteps` array — a `running` event followed by a `complete` event for the same step ID results in a single step with the final state.

---

## 9. Persistence Model

### In-Memory (React State)
- Active conversation messages including full `pipelineSteps` with `results` arrays
- Streaming state during active chat
- UI state (dialogs, tabs, mode)

### sessionStorage (Browser)
- `astra_token`, `astra_endpoint`, `ibm_api_key`, `watsonx_project_id`
- Cleared automatically when the tab closes
- Prevents re-entering credentials on page refresh within the same session

### localStorage (Browser)
- `theme` — persisted across sessions

### Astra DB (`dap_*` collections)

**`dap_conversations`**
```ts
{ id, name, createdAt, updatedAt, messageCount }
```

**`dap_messages`**
```ts
{
  id, conversationId, role, content, timestamp,
  searchMode?, latencyMs?,
  pipelineSteps?: [{
    id, status, latencyMs?,
    data: {
      // Analyze: { collection, searchMode, intent, ... }
      // Embed:   { preview, dims, real }
      // Search:  { collection, command, resultCount }  ← results array DROPPED
      // Respond: { content }
    }
  }],
  sources?: DocumentSource[]
}
```

> The `results` array in the search step is dropped before persisting to avoid storing large payloads. The `resultCount` field preserves the count for display purposes.

---

## 10. Type System

All shared types live in `src/lib/types.ts`:

```ts
interface Collection {
  name: string
  count: number
  vectorDim: number | null
  vectorizeService?: { provider: string; modelName: string } | null
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: DocumentSource[]
  searchMode?: "vector" | "hybrid" | "lexical"
  latencyMs?: number
  timestamp: Date
  pipelineSteps?: PipelineStep[]
}

interface PipelineStep {
  id: "analyze" | "embed" | "search" | "respond"
  status: "pending" | "running" | "complete" | "error" | "skipped"
  latencyMs?: number
  data?: Record<string, unknown>
}

interface DocumentSource {
  collection: string
  id: string
  similarity: number
  preview: Record<string, string | number>
}

interface Conversation {
  id: string
  name: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  messageCount: number
}

interface CollectionDocument {
  _id: string
  $vector?: number[] | null
  [key: string]: unknown
}
```

---

## 11. External Service Integration

### Astra DB (`@datastax/astra-db-ts`)

Client is created per-request in `src/lib/astra.ts`:

```ts
export function getAstraClient(token: string, endpoint: string) {
  const client = new DataAPIClient(token);
  return client.db(endpoint);
}
```

System fields excluded from column display:
```ts
export const SYSTEM_FIELDS = ["_id", "$vector", "$vectorize", "$hybrid", "$score", "$similarity"];
```

### IBM WatsonX AI (`@ibm-cloud/watsonx-ai`)

```ts
const watsonx = WatsonxAI.newInstance({
  version: "2024-05-31",
  serviceUrl: process.env.WATSONX_SERVICE_URL,
  authenticator: new IamAuthenticator({ apikey }),
});

// Text generation
await watsonx.textChat({ model_id: "ibm/granite-3-8b-instruct", messages, ... })

// Embeddings
await watsonx.textEmbedding({ model_id: "ibm/slate-125m-english-rtrvr-v2", input: [text] })
```

### HuggingFace (Embed Fallback)

```ts
const res = await fetch(
  "https://api-inference.huggingface.co/models/ibm/granite-embedding-125m-english",
  { headers: { Authorization: `Bearer ${HF_KEY}` }, body: JSON.stringify({ inputs: [text] }) }
);
const [[vector]] = await res.json();
```

### Credential Flow

```
Environment Variables (server-side only)
    └─► API route reads process.env.*
         └─► Overridden by request headers if user entered credentials in UI

Browser sessionStorage (client-side)
    └─► usePlaygroundState reads on mount
         └─► Passed as JSON body fields in all /api/* requests
              └─► API routes check body fields first, then fall back to env vars
```
