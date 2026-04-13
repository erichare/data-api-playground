import {
  ANALYZE_MAX_TOKENS,
  MAX_LIMIT,
} from "@/lib/chat/constants";
import { buildAnalyzePrompt } from "@/lib/chat/prompt";
import { generateResponse } from "@/lib/chat/response";
import { embedQuery, searchCollections, sanitizeFilterField } from "@/lib/chat/search";
import {
  generateText,
  type EnsureModelProgress,
  type EnsureModelResult,
  type ResolvedAiBackend,
} from "@/lib/ai/service";
import type {
  AnalyzeDecision,
  ChatRequestPayload,
  StepEvent,
} from "@/lib/chat/types";

interface RunChatWorkflowArgs {
  payload: ChatRequestPayload;
  token?: string;
  endpoint?: string;
  backend: ResolvedAiBackend;
  send: (event: StepEvent) => void;
}

/**
 * Execute the full RAG chat pipeline: analyze -> embed -> search -> respond.
 *
 * Each stage emits `StepEvent` objects via `send()` so the client can render
 * a real-time pipeline trace. Supports multi-collection fan-out search,
 * server-side vectorize, and automatic Ollama model preparation.
 */
export async function runChatWorkflow({
  payload,
  token,
  endpoint,
  backend,
  send,
}: RunChatWorkflowArgs) {
  const isConnected = !!(token && endpoint);
  const decision = await analyzeChatRequest({
    payload,
    backend,
    send,
  });

  let searchResults: import("@/lib/chat/types").SearchResult[] = [];
  let resolvedCollection = decision.collection;

  const searchCollectionNames =
    decision.allCollections && decision.userCollections.length > 1
      ? decision.userCollections
      : decision.targetedCollections ?? [decision.collection];
  const collectionsToSearch = searchCollectionNames.map((name) => {
    const collectionMeta = payload.collections?.find((collection) => collection.name === name);
    return {
      name,
      isVec: collectionMeta?.isVectorize ?? false,
      vectorDimension: collectionMeta?.vectorDimension ?? null,
    };
  });
  const isVectorize = collectionsToSearch.every((collection) => collection.isVec);

  if (decision.skipSearch) {
    send({ step: "embed", status: "skipped" });
    send({ step: "search", status: "skipped" });
  } else {
    send({ step: "embed", status: "running" });
    const embedStart = Date.now();
    const {
      embeddingVector,
      vectorPreview,
      realEmbedding,
      provider,
      model,
    } = await withPrepareTracking({
      kind: "embed",
      send,
      task: (onPrepareProgress, onPrepared) =>
        embedQuery({
          backend,
          query: payload.query,
          isVectorize,
          onPrepareProgress,
          onPrepared,
        }),
    });

    send({
      step: "embed",
      status: "complete",
      latencyMs: Date.now() - embedStart,
      data: {
        preview: vectorPreview,
        dims: isVectorize ? 0 : embeddingVector.length,
        real: realEmbedding,
        provider,
        model,
      },
    });

    send({ step: "search", status: "running" });
    const searchStart = Date.now();
    const searchOutcome = await searchCollections({
      token,
      endpoint,
      keyspace: payload.keyspace,
      isConnected,
      query: payload.query,
      collection: decision.collection,
      collections: payload.collections,
      collectionsToSearch,
      userCollections: decision.userCollections,
      searchMode: decision.searchMode,
      sortField: decision.sortField,
      sortDir: decision.sortDir,
      limit: decision.limit,
      filterField: decision.filterField,
      filterOp: decision.filterOp,
      filterValue: decision.filterValue,
      embeddingVector,
    });
    searchResults = searchOutcome.searchResults;
    resolvedCollection = searchOutcome.collection;

    send({
      step: "search",
      status: "complete",
      latencyMs: Date.now() - searchStart,
      data: {
        command: searchOutcome.commandStr,
        count: searchResults.length,
        collection: resolvedCollection,
        collections:
          collectionsToSearch.length > 1
            ? collectionsToSearch.map((collection) => collection.name)
            : undefined,
        results: searchResults,
      },
    });
  }

  send({ step: "respond", status: "running" });
  const respondStart = Date.now();
  const response = await withPrepareTracking({
    kind: "chat",
    send,
    task: (onPrepareProgress, onPrepared) =>
      generateResponse({
        backend,
        query: payload.query,
        skipSearch: decision.skipSearch,
        searchResults,
        allCollections: decision.allCollections,
        targetedCollections: decision.targetedCollections,
        userCollections: decision.userCollections,
        collection: resolvedCollection,
        allCollectionFields: payload.allCollectionFields ?? {},
        collectionFields: decision.collectionFields,
        history: payload.history,
        onPrepareProgress,
        onPrepared,
        onTextChunk: (chunk) => {
          send({
            step: "respond",
            status: "running",
            data: {
              provider: chunk.provider,
              model: chunk.model,
              delta: chunk.delta,
              content: chunk.content,
            },
          });
        },
      }),
  });

  send({
    step: "respond",
    status: "complete",
    latencyMs: Date.now() - respondStart,
    data: {
      content: response.content,
      provider: response.provider,
      model: response.model,
    },
  });
}

interface AnalyzeChatRequestArgs {
  payload: ChatRequestPayload;
  backend: ResolvedAiBackend;
  send: (event: StepEvent) => void;
}

interface AnalyzeContext extends AnalyzeDecision {
  userCollections: string[];
}

function extractJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : "{}";
}

const CROSS_COLLECTION_RE =
  /\b(all (my )?(data|collections?)|tell me about my data|what('s| is| do i have| can you tell me about) (in )?(all |my )?(data|collections?)|overview of (everything|all)|across (all|every) collection|everything (i('ve| have) got|in my))\b/i;

const COLLECTIONS_META_RE =
  /\b(what (collections?|data(bases?)?) (do i have|are (there|available)|exist)|list (my |the )?(collections?|data)|show (me )?(my |the )?(collections?|data(bases?)?)|(how many|which) collections?)\b/i;

const REFORMAT_RE =
  /^(and |now |can you )?(show|put|display|format|give|render|reformat|convert|present|output|turn|make|do|write|list|show)?\s*(it|that|this|them|those|the (results?|data|answer|response|output|above|previous))?[\s,]*(in(to)?|as|using|with)?\s*(a\s+)?(table|markdown|bullet|list|json|csv|chart|sorted|numbered|formatted|different format|condensed|summary|brief|short|long)[\s\w]*/i;

const SHORT_FOLLOW_UP_RE =
  /^(and\s+)?(in\s+)?(a\s+)?(table|bullet|list|json|csv|markdown|numbered|sorted)(\s+format)?[?.]?$/i;

function applyRegexFallbacks(args: {
  query: string;
  hasHistory: boolean;
  userCollections: string[];
  allCollections: boolean;
  skipSearch: boolean;
}): { allCollections: boolean; skipSearch: boolean } {
  let { allCollections, skipSearch } = args;
  const trimmed = args.query.trim();

  if (!allCollections && args.userCollections.length > 1) {
    if (CROSS_COLLECTION_RE.test(args.query)) allCollections = true;
  }

  if (!skipSearch && COLLECTIONS_META_RE.test(args.query)) {
    skipSearch = true;
    allCollections = true;
  }

  if (
    !skipSearch &&
    args.hasHistory &&
    (REFORMAT_RE.test(trimmed) || SHORT_FOLLOW_UP_RE.test(trimmed))
  ) {
    skipSearch = true;
  }

  return { allCollections, skipSearch };
}

async function analyzeChatRequest({
  payload,
  backend,
  send,
}: AnalyzeChatRequestArgs): Promise<AnalyzeContext> {
  send({ step: "analyze", status: "running" });
  const analyzeStart = Date.now();

  const collectionNames = payload.collections?.map((collection) => collection.name) ?? [];
  const userCollections = collectionNames.filter((name) => !name.startsWith("dap_"));
  const defaultCollection =
    payload.activeCollection && !payload.activeCollection.startsWith("dap_")
      ? payload.activeCollection
      : userCollections[0] || "documents";

  let collection = defaultCollection;
  let searchMode = payload.searchMode ?? "hybrid";
  let intent = "Searching for relevant documents";
  let limit = 5;
  let sortField: string | null = null;
  let sortDir: "asc" | "desc" = "desc";
  let filterField: string | null = null;
  let filterOp: string | null = null;
  let filterValue: unknown = null;
  let skipSearch = false;
  let allCollections = false;
  let targetedCollections: string[] | null = null;

  const allCollectionFields = payload.allCollectionFields ?? {};
  const perCollectionFieldsLines = userCollections
    .map((name) => {
      const fields = allCollectionFields[name];
      return fields && fields.length > 0 ? `  - ${name}: ${fields.join(", ")}` : null;
    })
    .filter(Boolean)
    .join("\n");
  const fieldsSection = perCollectionFieldsLines
    ? `\nPer-collection known fields:\n${perCollectionFieldsLines}`
    : "";

  let rawAnalysis = "(pending)";
  let analysisProvider = backend.provider;
  let analysisModel = backend.chatModel;

  const collectionList =
    userCollections.length > 0 ? userCollections.join(", ") : "documents";
  try {
    const analyzePrompt = buildAnalyzePrompt({
      collectionList,
      defaultCollection,
      fieldsSection,
      history: payload.history,
      query: payload.query,
    });
    const analysis = await withPrepareTracking({
      kind: "chat",
      send,
      task: (onPrepareProgress, onPrepared) =>
        generateText({
          backend,
          messages: [{ role: "user", content: analyzePrompt }],
          maxTokens: ANALYZE_MAX_TOKENS,
          onPrepareProgress,
          onPrepared,
        }),
    });
    analysisProvider = analysis.provider;
    analysisModel = analysis.model;
    rawAnalysis = analysis.content;
    const parsed = JSON.parse(extractJsonObject(analysis.content)) as {
      collection?: string;
      collections?: string[] | null;
      searchMode?: string;
      intent?: string;
      limit?: number;
      sortField?: string | null;
      sortDir?: string;
      filterField?: string | null;
      filterOp?: string | null;
      filterValue?: unknown;
      skipSearch?: boolean;
      allCollections?: boolean;
    };

    if (
      parsed.collection &&
      (collectionNames.length === 0 || collectionNames.includes(parsed.collection))
    ) {
      collection = parsed.collection;
    }
    const VALID_SEARCH_MODES = new Set(["vector", "hybrid", "lexical"]);
    if (parsed.searchMode && VALID_SEARCH_MODES.has(parsed.searchMode)) {
      searchMode = parsed.searchMode;
    }
    intent = parsed.intent ?? intent;
    if (parsed.limit && parsed.limit > 0) {
      limit = Math.min(parsed.limit, MAX_LIMIT);
    }
    if (parsed.sortField) sortField = sanitizeFilterField(parsed.sortField);
    if (parsed.sortDir === "asc" || parsed.sortDir === "desc") sortDir = parsed.sortDir;
    if (parsed.filterField && parsed.filterValue != null) {
      filterField = parsed.filterField;
      filterOp = parsed.filterOp ?? "$eq";
      filterValue = parsed.filterValue;
    }
    if (parsed.skipSearch === true) skipSearch = true;
    if (parsed.allCollections === true) allCollections = true;
    if (Array.isArray(parsed.collections) && parsed.collections.length > 1) {
      const valid = parsed.collections.filter((name) => collectionNames.includes(name));
      if (valid.length > 1) targetedCollections = valid;
    }
  } catch (error) {
    rawAnalysis = `ERROR: ${error instanceof Error ? error.message : String(error)} | raw: ${rawAnalysis}`;
  }

  const regexOverrides = applyRegexFallbacks({
    query: payload.query,
    hasHistory: (payload.history?.length ?? 0) > 0,
    userCollections,
    allCollections,
    skipSearch,
  });
  allCollections = regexOverrides.allCollections;
  skipSearch = regexOverrides.skipSearch;

  if (allCollections) {
    intent = `Overview across all collections: ${userCollections.join(", ")}`;
  } else if (targetedCollections) {
    intent = `${intent} [searching: ${targetedCollections.join(", ")}]`;
  }

  const collectionFields = allCollectionFields[collection] ?? [];
  const analyzeCollections = allCollections
    ? userCollections
    : targetedCollections ?? undefined;

  send({
    step: "analyze",
    status: "complete",
    latencyMs: Date.now() - analyzeStart,
    data: {
      collection,
      collections: analyzeCollections,
      allCollections: allCollections || undefined,
      searchMode,
      intent,
      limit,
      ...(sortField ? { sortField } : {}),
      ...(sortDir ? { sortDir } : {}),
      ...(filterField ? { filterField } : {}),
      ...(filterOp ? { filterOp } : {}),
      ...(filterValue != null ? { filterValue } : {}),
      ...(collectionFields.length > 0 ? { fields: collectionFields } : {}),
      ...(skipSearch ? { skipSearch: true } : {}),
      _raw: rawAnalysis,
      provider: analysisProvider,
      model: analysisModel,
    },
  });

  return {
    collection,
    searchMode,
    intent,
    limit,
    sortField,
    sortDir,
    filterField,
    filterOp,
    filterValue,
    skipSearch,
    allCollections,
    targetedCollections,
    analyzeCollections,
    collectionFields,
    rawAnalysis,
    userCollections,
  };
}

async function withPrepareTracking<T>(args: {
  kind: "chat" | "embed";
  send: (event: StepEvent) => void;
  task: (
    onPrepareProgress: (progress: EnsureModelProgress) => void,
    onPrepared: (result: EnsureModelResult) => void
  ) => Promise<T>;
}): Promise<T> {
  const { kind, send, task } = args;
  const prepareStart = Date.now();
  let sawProgress = false;
  let completed = false;
  let downloaded = false;
  let finalProvider = "ollama";
  let finalModel = "";

  const finalizePrepare = (result?: EnsureModelResult) => {
    if (!sawProgress || completed) return;
    completed = true;
    send({
      step: "prepare",
      status: "complete",
      latencyMs: Date.now() - prepareStart,
      data: {
        provider: finalProvider,
        model: result?.model ?? finalModel,
        kind,
        downloaded: result?.downloaded ?? downloaded,
      },
    });
  };

  const onPrepareProgress = (progress: EnsureModelProgress) => {
    sawProgress = true;
    finalProvider = progress.provider;
    finalModel = progress.model;
    if (progress.status !== "Model already installed") downloaded = true;
    send({
      step: "prepare",
      status: "running",
      data: {
        provider: progress.provider,
        model: progress.model,
        kind: progress.kind,
        message: progress.status,
        ...(typeof progress.completed === "number" ? { completed: progress.completed } : {}),
        ...(typeof progress.total === "number" ? { total: progress.total } : {}),
        determinate: progress.determinate,
      },
    });
  };

  const result = await task(onPrepareProgress, finalizePrepare);
  finalizePrepare();

  return result;
}
