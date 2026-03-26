import { NextRequest } from "next/server";
import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import { getAstraDb, SYSTEM_FIELDS } from "@/lib/astra";

export const runtime = "nodejs";

// ── Constants ─────────────────────────────────────────────────────────────────
const WATSONX_VERSION = "2024-05-31";
const GRANITE_CHAT_MODEL = "ibm/granite-3-8b-instruct";
const GRANITE_EMBED_MODEL = "ibm/slate-125m-english-rtrvr-v2";
const ANALYZE_MAX_TOKENS = 300;
const RESPOND_MAX_TOKENS = 1500;
const MAX_LIMIT = 1000;

type SearchResult = { id: string; similarity: number; preview: Record<string, string | number>; collection?: string };

type StepEvent =
  | { step: "analyze"; status: "running" }
  | { step: "analyze"; status: "complete"; latencyMs: number; data: { collection: string; collections?: string[]; allCollections?: boolean; searchMode: string; intent: string; limit: number; sortField?: string; sortDir?: string; filterField?: string; filterOp?: string; filterValue?: unknown; fields?: string[]; skipSearch?: boolean; _raw?: string } }
  | { step: "embed"; status: "running" }
  | { step: "embed"; status: "complete"; latencyMs: number; data: { preview: number[]; dims: number; real: boolean } }
  | { step: "embed"; status: "skipped" }
  | { step: "search"; status: "running" }
  | { step: "search"; status: "complete"; latencyMs: number; data: { command: string; count: number; collection: string; collections?: string[]; results: SearchResult[] } }
  | { step: "search"; status: "skipped" }
  | { step: "respond"; status: "running" }
  | { step: "respond"; status: "complete"; latencyMs: number; data: { content: string } }
  | { step: "respond"; status: "error"; latencyMs: number; data: { error: string } };

/** Extract a short preview from a document — skip system fields */
function docPreview(doc: Record<string, unknown>): Record<string, string | number> {
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

export async function POST(req: NextRequest) {
  const {
    query,
    searchMode: hintMode,
    token,
    endpoint,
    collections,
    activeCollection,
    ibmApiKey: bodyIbmApiKey,
    watsonxProjectId: bodyProjectId,
    allCollectionFields: bodyAllCollectionFields,
    history,
  } = await req.json() as {
    query: string;
    searchMode: string;
    token?: string;
    endpoint?: string;
    collections?: { name: string; isVectorize: boolean }[];
    activeCollection?: string;
    ibmApiKey?: string;
    watsonxProjectId?: string;
    allCollectionFields?: Record<string, string[]>;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  const isConnected = !!(token && endpoint);
  const collectionNames = collections?.map((c) => c.name) ?? [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StepEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      const ibmApiKey = bodyIbmApiKey || process.env.WATSONX_API_KEY;
      const projectId = bodyProjectId || process.env.WATSONX_PROJECT_ID;
      const watsonxUrl = process.env.WATSONX_URL || "https://wml-fvt.ml.test.cloud.ibm.com";
      const iamUrl = process.env.WATSONX_IAM_URL || "https://iam.test.cloud.ibm.com";
      const hfKey = process.env.HUGGINGFACE_API_KEY;
      // Client is safe to reuse for the request lifetime; projectId is validated by the truthy guard
      const watsonx = ibmApiKey && projectId
        ? new WatsonXAI({ version: WATSONX_VERSION, serviceUrl: watsonxUrl, authenticator: new IamAuthenticator({ apikey: ibmApiKey, url: iamUrl }) })
        : null;

      try {
        // ── Step 1: Analyze query ─────────────────────────────────────────────
        send({ step: "analyze", status: "running" });
        const analyzeStart = Date.now();

        const userCollections = collectionNames.filter((n) => !n.startsWith("dap_"));
        const defaultCollection = (activeCollection && !activeCollection.startsWith("dap_"))
          ? activeCollection
          : userCollections[0] || "documents";
        let collection = defaultCollection;
        let searchMode = hintMode ?? "hybrid";
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

        // Per-collection field names cached at connect time (passed from client)
        const allCollectionFields: Record<string, string[]> = bodyAllCollectionFields ?? {};
        // Active collection fields (for respond step context)
        const collectionFields: string[] = allCollectionFields[defaultCollection] ?? [];

        // Build a per-collection fields description for the analyze prompt
        const perCollectionFieldsLines = userCollections
          .map((n) => {
            const fields = allCollectionFields[n];
            return fields && fields.length > 0 ? `  - ${n}: ${fields.join(", ")}` : null;
          })
          .filter(Boolean)
          .join("\n");
        const fieldsSection = perCollectionFieldsLines
          ? `\nPer-collection known fields:\n${perCollectionFieldsLines}`
          : "";

        let rawAnalysis = watsonx ? "(pending)" : "(no watsonx config)";
        if (watsonx) {
          const userCollectionNames = collectionNames.filter((n) => !n.startsWith("dap_"));
          const collectionList = userCollectionNames.length > 0
            ? userCollectionNames.join(", ")
            : "documents";
          try {
            const analyzePrompt = `Analyze this database query and respond with JSON only (no markdown, no explanation, no code fences).

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
            const analysis = await watsonx.textChat({
              modelId: GRANITE_CHAT_MODEL,
              projectId,
              messages: [{ role: "user", content: analyzePrompt }],
              maxTokens: ANALYZE_MAX_TOKENS,
              timeLimit: 10_000,
            });
            let text = (analysis.result.choices?.[0]?.message?.content ?? "{}").trim();
            rawAnalysis = text;
            // Strip markdown code fences if present, then extract the first {...} block
            text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            text = jsonMatch ? jsonMatch[0] : "{}";
            const parsed = JSON.parse(text) as { collection?: string; collections?: string[] | null; searchMode?: string; intent?: string; limit?: number; sortField?: string | null; sortDir?: string; filterField?: string | null; filterOp?: string | null; filterValue?: unknown; skipSearch?: boolean; allCollections?: boolean };
            if (parsed.collection && (collectionNames.length === 0 || collectionNames.includes(parsed.collection))) {
              collection = parsed.collection;
            }
            searchMode = parsed.searchMode ?? searchMode;
            intent = parsed.intent ?? intent;
            if (parsed.limit && parsed.limit > 0) limit = Math.min(parsed.limit, MAX_LIMIT);
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
              // Only accept collections that actually exist
              const valid = parsed.collections.filter((n) => collectionNames.includes(n));
              if (valid.length > 1) targetedCollections = valid;
            }
          } catch (e) {
            rawAnalysis = `ERROR: ${e} | raw: ${rawAnalysis}`;
          }
        }

        // Rule-based fallback: detect broad cross-collection intent even if the LLM missed it
        if (!allCollections && userCollections.length > 1) {
          const crossCollectionRe = /\b(all (my )?(data|collections?)|tell me about my data|what('s| is| do i have| can you tell me about) (in )?(all |my )?(data|collections?)|overview of (everything|all)|across (all|every) collection|everything (i('ve| have) got|in my))\b/i;
          if (crossCollectionRe.test(query)) allCollections = true;
        }
        // Detect collection meta queries — no DB search needed, answer from known metadata
        const collectionsMetaRe = /\b(what (collections?|data(bases?)?) (do i have|are (there|available)|exist)|list (my |the )?(collections?|data)|show (me )?(my |the )?(collections?|data(bases?)?)|(how many|which) collections?)\b/i;
        if (!skipSearch && collectionsMetaRe.test(query)) {
          skipSearch = true;
          allCollections = true; // so the respond step uses full scope context
        }
        // Detect reformatting/follow-up requests that reference the previous answer
        const reformatRe = /^(and |now |can you )?(show|put|display|format|give|render|reformat|convert|present|output|turn|make|do|write|list|show)?\s*(it|that|this|them|those|the (results?|data|answer|response|output|above|previous))?[\s,]*(in(to)?|as|using|with)?\s*(a\s+)?(table|markdown|bullet|list|json|csv|chart|sorted|numbered|formatted|different format|condensed|summary|brief|short|long)[\s\w]*/i;
        const shortFollowUpRe = /^(and\s+)?(in\s+)?(a\s+)?(table|bullet|list|json|csv|markdown|numbered|sorted)(\s+format)?[?.]?$/i;
        if (!skipSearch && history && history.length > 0 && (reformatRe.test(query.trim()) || shortFollowUpRe.test(query.trim()))) {
          skipSearch = true;
        }
        // Override intent so trace accurately reflects which collections will be searched
        if (allCollections) intent = `Overview across all collections: ${userCollections.join(", ")}`;
        else if (targetedCollections) intent = intent + ` [searching: ${targetedCollections.join(", ")}]`;

        const analyzeCollections = allCollections ? userCollections : (targetedCollections ?? undefined);
        send({ step: "analyze", status: "complete", latencyMs: Date.now() - analyzeStart, data: { collection, collections: analyzeCollections, allCollections: allCollections || undefined, searchMode, intent, limit, sortField: sortField ?? undefined, sortDir: sortField ? sortDir : undefined, filterField: filterField ?? undefined, filterOp: filterOp ?? undefined, filterValue: filterValue ?? undefined, fields: collectionFields.length > 0 ? collectionFields : undefined, skipSearch: skipSearch || undefined, _raw: rawAnalysis } });

        let searchResults: SearchResult[] = [];

        // Determine which collections to search (computed here so embed step can use it)
        const searchCollectionNames = allCollections && userCollections.length > 1
          ? userCollections
          : targetedCollections ?? [collection];
        const collectionsToSearch = searchCollectionNames.map((n) => ({
          name: n,
          isVec: collections?.find((c) => c.name === n)?.isVectorize ?? false,
        }));
        // Skip client embedding only if every target collection uses server-side vectorize
        const isVectorize = collectionsToSearch.every((c) => c.isVec);

        if (skipSearch) {
          send({ step: "embed", status: "skipped" });
          send({ step: "search", status: "skipped" });
        } else {

        // ── Step 2: Embed query via IBM Granite ───────────────────────────────
        send({ step: "embed", status: "running" });
        const embedStart = Date.now();

        let embeddingVector: number[] = [];
        let vectorPreview: number[] = [];
        let realEmbedding = false;

        let embedError: string | undefined;

        if (!isVectorize) {
          // 1st choice: watsonx Granite embedding (same credentials already in use)
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

          // 2nd choice: HuggingFace (fallback when watsonx not configured)
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
                  embedError = undefined; // clear watsonx error if HF succeeded
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
        } else {
          // Vectorize collection — embedding is server-side
          vectorPreview = [];
          realEmbedding = true;
        }

        send({
          step: "embed", status: "complete",
          latencyMs: Date.now() - embedStart,
          data: {
            preview: vectorPreview,
            dims: isVectorize ? 0 : (embeddingVector.length || 768),
            real: realEmbedding,
            ...(embedError ? { error: embedError } : {}),
          }
        });

        // ── Step 3: Search Astra DB ───────────────────────────────────────────
        send({ step: "search", status: "running" });
        const searchStart = Date.now();

        let commandStr = "";

        if (isConnected) {
          const db = getAstraDb(token!, endpoint!);

          // Build filter object if analyze detected a field constraint
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

          if (collectionsToSearch.length === 1) {
            // Single collection — preserve filter/retry logic
            try {
              const r = await executeSearch(collectionsToSearch[0].name, collectionsToSearch[0].isVec, filterClause, filterStr);
              searchResults = r.results;
              commandStr = r.command;
            } catch (searchErr) {
              if (hasFilter) {
                // Filter may be unsupported (e.g. $match on a non-indexed field) — retry without it
                const r = await executeSearch(collectionsToSearch[0].name, collectionsToSearch[0].isVec, {}, "{}");
                searchResults = r.results;
                commandStr = r.command;
              } else {
                const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
                throw new Error(`Search failed: ${msg}`);
              }
            }

            // Low-confidence fallback: if results are weak and other collections exist, fan out
            const otherCollections = userCollections.filter((n) => n !== collectionsToSearch[0].name);
            const topSimilarity = searchResults[0]?.similarity ?? 0;
            if (topSimilarity < LOW_SIMILARITY_THRESHOLD && otherCollections.length > 0) {
              const fanTargets = otherCollections.map((n) => ({
                name: n,
                isVec: collections?.find((c) => c.name === n)?.isVectorize ?? false,
              }));
              const fanResults = await Promise.allSettled(
                fanTargets.map(({ name, isVec }) => executeSearch(name, isVec, {}, "{}"))
              );
              const fanBest = fanResults
                .flatMap((r) => r.status === "fulfilled" ? r.value.results : [])
                .sort((a, b) => b.similarity - a.similarity);
              if ((fanBest[0]?.similarity ?? 0) > topSimilarity) {
                // A different collection has better results — use those and update scope
                searchResults = fanBest.slice(0, limit);
                const fanCollections = [...new Set(searchResults.map((r) => r.collection).filter(Boolean))];
                commandStr = `// Low-confidence fallback: searched ${fanCollections.join(", ")}`;
                // Update collection context for the respond step
                collection = fanCollections[0] ?? collection;
              }
            }
          } else {
            // Multi-collection fan-out — run all searches in parallel, merge by similarity
            const fanResults = await Promise.allSettled(
              collectionsToSearch.map(({ name, isVec }) => executeSearch(name, isVec, {}, "{}"))
            );
            searchResults = fanResults
              .flatMap((r) => r.status === "fulfilled" ? r.value.results : [])
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, limit);
            const successCount = fanResults.filter((r) => r.status === "fulfilled").length;
            commandStr = `// Searched ${successCount} collection${successCount !== 1 ? "s" : ""}: ${collectionsToSearch.map((c) => c.name).join(", ")}`;
          }
        } else {
          // Not connected — return empty (demo mode)
          await new Promise((r) => setTimeout(r, 80));
          commandStr = `await db.collection("${collection}")\n  .find({}, { sort: { $vector: embedding }, limit: ${limit} })\n  .toArray()`;
          searchResults = [];
        }

        send({
          step: "search", status: "complete",
          latencyMs: Date.now() - searchStart,
          data: {
            command: commandStr,
            count: searchResults.length,
            collection,
            collections: collectionsToSearch.length > 1 ? collectionsToSearch.map((c) => c.name) : undefined,
            results: searchResults,
          },
        });

        } // end else (skipSearch)

        // ── Step 4: Generate natural language response ────────────────────────
        send({ step: "respond", status: "running" });
        const respondStart = Date.now();

        let content = "";

        if (watsonx) {
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
          // Build a collections metadata summary for meta queries (skipSearch + allCollections)
          const collectionsSummary = skipSearch && allCollections && userCollections.length > 0
            ? `Your Astra DB collections:\n${userCollections.map((n) => {
                const fields = allCollectionFields[n];
                return `- ${n}${fields && fields.length > 0 ? `: fields — ${fields.join(", ")}` : ""}`;
              }).join("\n")}`
            : null;

          // Detect if this is a pure reformatting/follow-up with no new search
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

          try {
            const resp = await watsonx.textChat({
              modelId: GRANITE_CHAT_MODEL,
              projectId,
              messages: [
                { role: "system", content: systemPrompt },
                ...(history ?? []).slice(-10).map((m) => ({
                  ...m,
                  content: m.content
                    // Strip the entire "[Search results shown to user:]" block and everything after it
                    .replace(/\n?\[Search results shown to user:\][\s\S]*/g, "")
                    .replace(/\[End of Conversation\]/g, "")
                    .trim(),
                })),
                { role: "user", content: userContent },
              ],
              maxTokens: RESPOND_MAX_TOKENS,
              timeLimit: 20_000,
            });
            content = resp.result.choices?.[0]?.message?.content ?? "";
          } catch (respErr) {
            const errMsg = respErr instanceof Error ? respErr.message : "Failed to generate response";
            send({ step: "respond", status: "error", latencyMs: Date.now() - respondStart, data: { error: errMsg } });
            return;
          }
        } else {
          content = !skipSearch && searchResults.length > 0
            ? `Found ${searchResults.length} results in the ${collection} collection. Top result: ${JSON.stringify(searchResults[0].preview)}.`
            : "No AI model configured — add your IBM Cloud API key and watsonx Project ID to enable responses.";
        }

        send({ step: "respond", status: "complete", latencyMs: Date.now() - respondStart, data: { content } });

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(JSON.stringify({ error: msg }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
