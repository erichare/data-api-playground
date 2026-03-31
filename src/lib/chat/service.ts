import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import {
  ANALYZE_MAX_TOKENS,
  buildAnalyzePrompt,
  embedQuery,
  generateResponse,
  GRANITE_CHAT_MODEL,
  MAX_LIMIT,
  searchCollections,
} from "@/app/api/chat/shared";
import type {
  AnalyzeDecision,
  ChatRequestPayload,
  StepEvent,
} from "@/lib/chat/types";

interface RunChatWorkflowArgs {
  payload: ChatRequestPayload;
  token?: string;
  endpoint?: string;
  watsonx: WatsonXAI | null;
  projectId?: string;
  hfKey?: string;
  send: (event: StepEvent) => void;
}

export async function runChatWorkflow({
  payload,
  token,
  endpoint,
  watsonx,
  projectId,
  hfKey,
  send,
}: RunChatWorkflowArgs) {
  const isConnected = !!(token && endpoint);
  const decision = await analyzeChatRequest({
    payload,
    watsonx,
    projectId,
    send,
  });

  let searchResults: import("@/lib/chat/types").SearchResult[] = [];
  let resolvedCollection = decision.collection;

  const searchCollectionNames =
    decision.allCollections && decision.userCollections.length > 1
      ? decision.userCollections
      : decision.targetedCollections ?? [decision.collection];
  const collectionsToSearch = searchCollectionNames.map((name) => ({
    name,
    isVec: payload.collections?.find((collection) => collection.name === name)?.isVectorize ?? false,
  }));
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
      embedError,
    } = await embedQuery({
      watsonx,
      projectId,
      query: payload.query,
      hfKey,
      isVectorize,
    });

    send({
      step: "embed",
      status: "complete",
      latencyMs: Date.now() - embedStart,
      data: {
        preview: vectorPreview,
        dims: isVectorize ? 0 : embeddingVector.length || 768,
        real: realEmbedding,
        ...(embedError ? { error: embedError } : {}),
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
  const content = await generateResponse({
    watsonx,
    projectId,
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
  });

  send({
    step: "respond",
    status: "complete",
    latencyMs: Date.now() - respondStart,
    data: { content },
  });
}

interface AnalyzeChatRequestArgs {
  payload: ChatRequestPayload;
  watsonx: WatsonXAI | null;
  projectId?: string;
  send: (event: StepEvent) => void;
}

interface AnalyzeContext extends AnalyzeDecision {
  userCollections: string[];
}

async function analyzeChatRequest({
  payload,
  watsonx,
  projectId,
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

  let rawAnalysis = watsonx ? "(pending)" : "(no watsonx config)";

  if (watsonx && projectId) {
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
      const analysis = await watsonx.textChat({
        modelId: GRANITE_CHAT_MODEL,
        projectId,
        messages: [{ role: "user", content: analyzePrompt }],
        maxTokens: ANALYZE_MAX_TOKENS,
        timeLimit: 10_000,
      });
      let text = (analysis.result.choices?.[0]?.message?.content ?? "{}").trim();
      rawAnalysis = text;
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      text = jsonMatch ? jsonMatch[0] : "{}";
      const parsed = JSON.parse(text) as {
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
      searchMode = parsed.searchMode ?? searchMode;
      intent = parsed.intent ?? intent;
      if (parsed.limit && parsed.limit > 0) {
        limit = Math.min(parsed.limit, MAX_LIMIT);
      }
      if (parsed.sortField) sortField = parsed.sortField;
      if (parsed.sortDir === "asc") sortDir = "asc";
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
      rawAnalysis = `ERROR: ${error} | raw: ${rawAnalysis}`;
    }
  }

  if (!allCollections && userCollections.length > 1) {
    const crossCollectionRe =
      /\b(all (my )?(data|collections?)|tell me about my data|what('s| is| do i have| can you tell me about) (in )?(all |my )?(data|collections?)|overview of (everything|all)|across (all|every) collection|everything (i('ve| have) got|in my))\b/i;
    if (crossCollectionRe.test(payload.query)) allCollections = true;
  }

  const collectionsMetaRe =
    /\b(what (collections?|data(bases?)?) (do i have|are (there|available)|exist)|list (my |the )?(collections?|data)|show (me )?(my |the )?(collections?|data(bases?)?)|(how many|which) collections?)\b/i;
  if (!skipSearch && collectionsMetaRe.test(payload.query)) {
    skipSearch = true;
    allCollections = true;
  }

  const reformatRe =
    /^(and |now |can you )?(show|put|display|format|give|render|reformat|convert|present|output|turn|make|do|write|list|show)?\s*(it|that|this|them|those|the (results?|data|answer|response|output|above|previous))?[\s,]*(in(to)?|as|using|with)?\s*(a\s+)?(table|markdown|bullet|list|json|csv|chart|sorted|numbered|formatted|different format|condensed|summary|brief|short|long)[\s\w]*/i;
  const shortFollowUpRe =
    /^(and\s+)?(in\s+)?(a\s+)?(table|bullet|list|json|csv|markdown|numbered|sorted)(\s+format)?[?.]?$/i;
  if (
    !skipSearch &&
    payload.history &&
    payload.history.length > 0 &&
    (reformatRe.test(payload.query.trim()) || shortFollowUpRe.test(payload.query.trim()))
  ) {
    skipSearch = true;
  }

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
      sortField: sortField ?? undefined,
      sortDir: sortField ? sortDir : undefined,
      filterField: filterField ?? undefined,
      filterOp: filterOp ?? undefined,
      filterValue: filterValue ?? undefined,
      fields: collectionFields.length > 0 ? collectionFields : undefined,
      skipSearch: skipSearch || undefined,
      _raw: rawAnalysis,
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
