import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { getAstraDb, SYSTEM_FIELDS } from "@/lib/astra";
import type { ChatCollectionInfo, SearchResult } from "@/lib/chat/types";

export const GRANITE_CHAT_MODEL = "ibm/granite-3-8b-instruct";
export const GRANITE_EMBED_MODEL = "ibm/slate-125m-english-rtrvr-v2";
export const ANALYZE_MAX_TOKENS = 300;
export const RESPOND_MAX_TOKENS = 1500;
export const MAX_LIMIT = 1000;

export interface EmbedResult {
  embeddingVector: number[];
  vectorPreview: number[];
  realEmbedding: boolean;
  embedError?: string;
}

export function docPreview(doc: Record<string, unknown>): Record<string, string | number> {
  const preview: Record<string, string | number> = {};
  let count = 0;
  for (const [k, v] of Object.entries(doc)) {
    if (SYSTEM_FIELDS.has(k)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      preview[k] = typeof v === "boolean" ? String(v) : v as string | number;
      if (++count >= 4) break;
    }
  }
  return preview;
}

export function buildAnalyzePrompt(args: {
  collectionList: string;
  defaultCollection: string;
  fieldsSection: string;
  history?: { role: "user" | "assistant"; content: string }[];
  query: string;
}) {
  const { collectionList, defaultCollection, fieldsSection, history, query } = args;
  return `Analyze this database query and respond with JSON only (no markdown, no explanation, no code fences).

Available collections: ${collectionList}
Active collection: ${defaultCollection}
${fieldsSection}
${history && history.length > 0 ? `\nRecent conversation (for context only):\n${history.slice(-6).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")}\n` : ""}
Query: "${query}"

Rules (apply ALL that match):
1. "collection": pick the most relevant collection by matching the query topic/keywords against per-collection field names and collection names ONLY. IGNORE conversation history when choosing a collection — base it solely on which collection's fields best fit the query subject. Default to "${defaultCollection}" only if no collection is clearly more relevant.
2. "limit": if the user says "top N", "give me N", "N examples", etc., set this to N. Default 5.
3. "sortField": if the user says "highest X", "lowest X", "top by X", "best X", "ranked by X" — set to the snake_case field name. Prefer an exact match from the known fields list. Otherwise null.
4. "sortDir": "desc" for highest/best/top, "asc" for lowest/cheapest/worst. Default "desc".
5. "searchMode": "hybrid" by default unless query is purely keyword ("find exact phrase") → "lexical".
6. "intent": one sentence under 60 chars describing what the user wants.
7. "filterField": if the user wants to filter by a field value or condition, pick the most likely field from the known fields list. Otherwise null.
8. "filterOp": the comparison operator — "$match" for partial text/name searches (e.g. user says "named Eddie", "by Smith", "contains foo" — use this when the value is likely a partial name or word that appears within a longer field value), "$eq" for exact categorical matches (status, type, known enum values), "$gt"/"$gte"/"$lt"/"$lte" for numeric comparisons, "$ne" for not-equal, "$in" for multiple values, "$nin" for exclusion, "$exists" to check presence. null if no filter.
9. "filterValue": the value to compare. For "$match" use the partial name/word as a string. Use a number for numeric ops. Use a JSON array for "$in"/"$nin". Use true/false for "$exists". Use the exact string for "$eq"/"$ne". null if no filter.
10. "skipSearch": true if this question can be fully answered without a database search — e.g. follow-up questions about results already shown ("which was cheapest?", "summarize those"), clarifications, general questions, OR schema/meta questions about the collection itself ("what fields are available?", "what does this collection contain?", "what can I ask about?"). false otherwise.
11. "allCollections": true ONLY if the query is explicitly broad/exploratory across ALL data — e.g. "tell me about my data", "what do I have", "what's in all my collections", "give me an overview of everything". false for any query targeting a specific topic, entity, or field, even if the best collection is unclear.
12. "collections": when the query mentions a field name or concept that appears in multiple specific collections (but NOT all), list only those relevant collections here as a JSON array of strings. Leave as null if rule 11 applies (allCollections) or if only one collection is relevant.

JSON format: {"collection": "...", "collections": null, "searchMode": "...", "intent": "...", "limit": 5, "sortField": null, "sortDir": "desc", "filterField": null, "filterOp": null, "filterValue": null, "skipSearch": false, "allCollections": false}`;
}

export async function embedQuery(args: {
  watsonx: WatsonXAI | null;
  projectId?: string;
  query: string;
  hfKey?: string;
  isVectorize: boolean;
}): Promise<EmbedResult> {
  const { watsonx, projectId, query, hfKey, isVectorize } = args;
  let embeddingVector: number[] = [];
  let vectorPreview: number[] = [];
  let realEmbedding = false;
  let embedError: string | undefined;

  if (isVectorize) {
    return { embeddingVector, vectorPreview, realEmbedding: true };
  }

  if (watsonx && projectId) {
    try {
      const embedRes = await watsonx.embedText({
        modelId: GRANITE_EMBED_MODEL,
        projectId,
        inputs: [query],
      });
      const vec = embedRes.result.results?.[0]?.embedding;
      if (vec && vec.length > 100) {
        embeddingVector = vec;
        vectorPreview = vec.slice(0, 8).map((v) => parseFloat(v.toFixed(4)));
        realEmbedding = true;
      } else {
        embedError = "Unexpected embedding shape from watsonx";
      }
    } catch (e) {
      embedError = `watsonx embed error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (!realEmbedding) {
    try {
      const hfRes = await fetch(
        "https://router.huggingface.co/hf-inference/models/ibm-granite/granite-embedding-125m-english/pipeline/feature-extraction",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(hfKey ? { Authorization: `Bearer ${hfKey}` } : {}),
          },
          body: JSON.stringify({ inputs: query }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (hfRes.ok) {
        const result = await hfRes.json() as number[] | number[][];
        const flat = Array.isArray(result[0]) ? (result as number[][])[0] : result as number[];
        if (Array.isArray(flat) && flat.length > 100) {
          embeddingVector = flat;
          vectorPreview = flat.slice(0, 8).map((v) => parseFloat(v.toFixed(4)));
          realEmbedding = true;
          embedError = undefined;
        } else {
          embedError = (embedError ? embedError + "; " : "") + "Unexpected HuggingFace response shape";
        }
      } else {
        const text = await hfRes.text().catch(() => "");
        const hfErr = `HuggingFace ${hfRes.status}: ${text.slice(0, 100)}${!hfKey ? " (no HUGGINGFACE_API_KEY)" : ""}`;
        embedError = (embedError ? embedError + "; " : "") + hfErr;
      }
    } catch (e) {
      embedError = (embedError ? embedError + "; " : "") + (e instanceof Error ? e.message : "HuggingFace request failed");
    }
  }

  if (!realEmbedding) {
    vectorPreview = Array.from({ length: 8 }, () => parseFloat((Math.random() * 2 - 1).toFixed(4)));
  }

  return { embeddingVector, vectorPreview, realEmbedding, embedError };
}

export async function searchCollections(args: {
  token?: string;
  endpoint?: string;
  keyspace?: string;
  isConnected: boolean;
  query: string;
  collection: string;
  collections?: ChatCollectionInfo[];
  collectionsToSearch: { name: string; isVec: boolean }[];
  userCollections: string[];
  searchMode: string;
  sortField: string | null;
  sortDir: "asc" | "desc";
  limit: number;
  filterField: string | null;
  filterOp: string | null;
  filterValue: unknown;
  embeddingVector: number[];
}): Promise<{ searchResults: SearchResult[]; commandStr: string; collection: string }> {
  const {
    token, endpoint, keyspace, isConnected, query, collections, collectionsToSearch, userCollections,
    searchMode, sortField, sortDir, limit, filterField, filterOp, filterValue, embeddingVector,
  } = args;
  let { collection } = args;

  if (!isConnected) {
    await new Promise((r) => setTimeout(r, 80));
    return {
      searchResults: [],
      commandStr: `await db.collection("${collection}")\n  .find({}, { sort: { $vector: embedding }, limit: ${limit} })\n  .toArray()`,
      collection,
    };
  }

  const db = getAstraDb(token!, endpoint!, keyspace);
  const buildFilterClause = () => {
    if (!filterField || filterValue == null) return {};
    if (filterOp === "$eq" || !filterOp) return { [filterField]: filterValue };
    return { [filterField]: { [filterOp]: filterValue } };
  };
  const filterClause = buildFilterClause();
  const filterStr = filterField
    ? !filterOp || filterOp === "$eq"
      ? `{ ${filterField}: ${JSON.stringify(filterValue)} }`
      : `{ ${filterField}: { ${filterOp}: ${JSON.stringify(filterValue)} } }`
    : "{}";

  const executeSearch = async (colName: string, isVec: boolean, filter: Record<string, unknown>, fStr: string): Promise<{ results: SearchResult[]; command: string }> => {
    const coll = db.collection(colName);
    let results: SearchResult[] = [];
    let cmd = "";
    if (sortField) {
      const sortObj = { [sortField]: sortDir === "asc" ? 1 : -1 } as Record<string, 1 | -1>;
      cmd = `await db.collection("${colName}")\n  .find(${fStr}, { sort: { ${sortField}: ${sortDir === "asc" ? 1 : -1} }, limit: ${limit} })\n  .toArray()`;
      const docs = await coll.find(filter, { sort: sortObj, limit }).toArray();
      results = docs.map((d) => ({ id: String(d._id), similarity: 1, preview: docPreview(d as Record<string, unknown>), collection: colName }));
    } else if (isVec) {
      if (searchMode === "hybrid") {
        cmd = `await db.collection("${colName}")\n  .findAndRerank(${fStr}, { sort: { $hybrid: { $vectorize: query } }, limit: ${limit} })\n  .toArray()`;
        try {
          const cursor = coll.findAndRerank(filter, { sort: { $hybrid: { $vectorize: query } } as never, limit });
          const docs = await cursor.toArray();
          results = docs.map((d) => ({ id: String((d.document as Record<string, unknown>)._id), similarity: d.scores["$vector"] ?? d.scores["$reranker"] ?? 1, preview: docPreview(d.document as Record<string, unknown>), collection: colName }));
        } catch {
          cmd = `await db.collection("${colName}")\n  .find(${fStr}, { sort: { $vectorize: query }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
          const docs = await coll.find(filter, { sort: { $vectorize: query }, limit, includeSimilarity: true }).toArray();
          results = docs.map((d) => ({ id: String(d._id), similarity: (d as { $similarity?: number }).$similarity ?? 1, preview: docPreview(d as Record<string, unknown>), collection: colName }));
        }
      } else {
        cmd = `await db.collection("${colName}")\n  .find(${fStr}, { sort: { $vectorize: query }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
        const docs = await coll.find(filter, { sort: { $vectorize: query }, limit, includeSimilarity: true }).toArray();
        results = docs.map((d) => ({ id: String(d._id), similarity: (d as { $similarity?: number }).$similarity ?? 1, preview: docPreview(d as Record<string, unknown>), collection: colName }));
      }
    } else if (embeddingVector.length > 0) {
      cmd = `await db.collection("${colName}")\n  .find(${fStr}, { sort: { $vector: embedding }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
      const docs = await coll.find(filter, { sort: { $vector: embeddingVector }, limit, includeSimilarity: true }).toArray();
      results = docs.map((d) => ({ id: String(d._id), similarity: (d as { $similarity?: number }).$similarity ?? 1, preview: docPreview(d as Record<string, unknown>), collection: colName }));
    } else {
      cmd = `await db.collection("${colName}")\n  .find(${fStr}, { limit: ${limit} })\n  .toArray()`;
      const docs = await coll.find(filter, { limit }).toArray();
      results = docs.map((d) => ({ id: String(d._id), similarity: 1, preview: docPreview(d as Record<string, unknown>), collection: colName }));
    }
    return { results, command: cmd };
  };

  const hasFilter = Object.keys(filterClause).length > 0;
  const LOW_SIMILARITY_THRESHOLD = 0.5;
  let searchResults: SearchResult[] = [];
  let commandStr = "";

  if (collectionsToSearch.length === 1) {
    try {
      const r = await executeSearch(collectionsToSearch[0].name, collectionsToSearch[0].isVec, filterClause, filterStr);
      searchResults = r.results;
      commandStr = r.command;
    } catch (searchErr) {
      if (hasFilter) {
        const r = await executeSearch(collectionsToSearch[0].name, collectionsToSearch[0].isVec, {}, "{}");
        searchResults = r.results;
        commandStr = r.command;
      } else {
        const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
        throw new Error(`Search failed: ${msg}`);
      }
    }

    const otherCollections = userCollections.filter((n) => n !== collectionsToSearch[0].name);
    const topSimilarity = searchResults[0]?.similarity ?? 0;
    if (topSimilarity < LOW_SIMILARITY_THRESHOLD && otherCollections.length > 0) {
      const fanTargets = otherCollections.map((n) => ({
        name: n,
        isVec: collections?.find((c) => c.name === n)?.isVectorize ?? false,
      }));
      const fanResults = await Promise.allSettled(
        fanTargets.map(({ name, isVec }) =>
          executeSearch(name, isVec, hasFilter ? filterClause : {}, hasFilter ? filterStr : "{}")
        )
      );
      const fanBest = fanResults
        .flatMap((r) => r.status === "fulfilled" ? r.value.results : [])
        .sort((a, b) => b.similarity - a.similarity);
      if ((fanBest[0]?.similarity ?? 0) > topSimilarity) {
        searchResults = fanBest.slice(0, limit);
        const fanCollections = [...new Set(searchResults.map((r) => r.collection).filter(Boolean))];
        commandStr = `// Low-confidence fallback: searched ${fanCollections.join(", ")}`;
        collection = fanCollections[0] ?? collection;
      }
    }
  } else {
    const fanResults = await Promise.allSettled(
      collectionsToSearch.map(({ name, isVec }) =>
        executeSearch(name, isVec, hasFilter ? filterClause : {}, hasFilter ? filterStr : "{}")
      )
    );
    searchResults = fanResults
      .flatMap((r) => r.status === "fulfilled" ? r.value.results : [])
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    const successCount = fanResults.filter((r) => r.status === "fulfilled").length;
    commandStr = `// Searched ${successCount} collection${successCount !== 1 ? "s" : ""}: ${collectionsToSearch.map((c) => c.name).join(", ")}`;
  }

  return { searchResults, commandStr, collection };
}

export async function generateResponse(args: {
  watsonx: WatsonXAI | null;
  projectId?: string;
  query: string;
  skipSearch: boolean;
  searchResults: SearchResult[];
  allCollections: boolean;
  targetedCollections: string[] | null;
  userCollections: string[];
  collection: string;
  allCollectionFields: Record<string, string[]>;
  collectionFields: string[];
  history?: { role: "user" | "assistant"; content: string }[];
}) {
  const {
    watsonx, projectId, query, skipSearch, searchResults, allCollections, targetedCollections,
    userCollections, collection, allCollectionFields, collectionFields, history,
  } = args;

  if (!watsonx) {
    return !skipSearch && searchResults.length > 0
      ? `Found ${searchResults.length} results in the ${collection} collection. Top result: ${JSON.stringify(searchResults[0].preview)}.`
      : "No AI model configured — add your IBM Cloud API key and watsonx Project ID to enable responses.";
  }

  const searchWasRun = !skipSearch;
  const noResults = searchWasRun && searchResults.length === 0;
  const resultContext = searchWasRun && searchResults.length > 0
    ? searchResults.map((r, i) =>
        `[${i + 1}] id=${r.id} similarity=${r.similarity}\n${Object.entries(r.preview).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`
      ).join("\n\n")
    : null;

  const scopeDesc = allCollections
    ? `ALL collections: ${userCollections.join(", ")}`
    : targetedCollections
      ? `collections: ${targetedCollections.join(", ")}`
      : `the "${collection}" collection`;
  const activeFields = targetedCollections
    ? targetedCollections.flatMap((n) => allCollectionFields[n] ?? [])
    : collectionFields;
  const systemPrompt = `You are a concise data analyst for an Astra DB playground. The user is exploring ${scopeDesc}.${!allCollections && activeFields && activeFields.length > 0 ? ` Known fields: ${activeFields.join(", ")}.` : ""} CRITICAL RULES: (1) Answer the question directly and immediately — your first sentence must be the answer. (2) Match the format the user asks for exactly: "one word" → one word; "table" → markdown table; "list" → bullet list; "briefly" → short. (3) NEVER output the raw source data you were given — do not echo field names, IDs, pipe-separated rows, or numbered result blocks. Use the data to derive your answer only. (4) Do NOT include lines like "[Search results shown to user:]", "[1] field: value", or any raw record dump in your response. (5) Only add analysis if the user explicitly asked for it.`;
  const collectionsSummary = skipSearch && allCollections && userCollections.length > 0
    ? `Your Astra DB collections:\n${userCollections.map((n) => {
        const fields = allCollectionFields[n];
        return `- ${n}${fields && fields.length > 0 ? `: fields — ${fields.join(", ")}` : ""}`;
      }).join("\n")}`
    : null;
  const isReformatFollowUp = skipSearch && !collectionsSummary && history && history.length > 0;

  const userContent = resultContext
    ? `User asked: "${query}"\n\nContext data from ${scopeDesc} (use this to answer — do not reproduce it):\n${resultContext}\n\nAnswer the question only. Do not output the raw records.`
    : noResults
      ? `User asked: "${query}"\n\nThe database search of ${scopeDesc} returned no results. Start your response by briefly noting no matching records were found, then answer from your general knowledge if applicable.`
      : collectionsSummary
        ? `User asked: "${query}"\n\n${collectionsSummary}\n\nAnswer using only the information above.`
        : isReformatFollowUp
          ? `The user is asking a follow-up or requesting a different format: "${query}"\n\nReformat or continue your previous response accordingly. Do not search the database again.`
          : query;

  const resp = await watsonx.textChat({
    modelId: GRANITE_CHAT_MODEL,
    projectId,
    messages: [
      { role: "system", content: systemPrompt },
      ...(history ?? []).slice(-10).map((m) => ({
        ...m,
        content: m.content
          .replace(/\n?\[Search results shown to user:\][\s\S]*/g, "")
          .replace(/\[End of Conversation\]/g, "")
          .trim(),
      })),
      { role: "user", content: userContent },
    ],
    maxTokens: RESPOND_MAX_TOKENS,
    timeLimit: 20_000,
  });
  return resp.result.choices?.[0]?.message?.content ?? "";
}
