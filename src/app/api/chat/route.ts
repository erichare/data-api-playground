import { NextRequest } from "next/server";
import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import { resolveAstraConnection } from "@/lib/astra";
import {
  ANALYZE_MAX_TOKENS,
  buildAnalyzePrompt,
  embedQuery,
  generateResponse,
  GRANITE_CHAT_MODEL,
  MAX_LIMIT,
  SearchResult,
  searchCollections,
  StepEvent,
} from "./shared";

export const runtime = "nodejs";

// ── Constants ─────────────────────────────────────────────────────────────────
const WATSONX_VERSION = "2024-05-31";

export async function POST(req: NextRequest) {
  const {
    query,
    searchMode: hintMode,
    token: bodyToken,
    endpoint: bodyEndpoint,
    keyspace,
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
    keyspace?: string;
    collections?: { name: string; isVectorize: boolean }[];
    activeCollection?: string;
    ibmApiKey?: string;
    watsonxProjectId?: string;
    allCollectionFields?: Record<string, string[]>;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  const { token, endpoint } = resolveAstraConnection({ token: bodyToken, endpoint: bodyEndpoint });
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
            const analyzePrompt = buildAnalyzePrompt({
              collectionList,
              defaultCollection,
              fieldsSection,
              history,
              query,
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
        const {
          embeddingVector,
          vectorPreview,
          realEmbedding,
          embedError,
        } = await embedQuery({
          watsonx,
          projectId,
          query,
          hfKey,
          isVectorize,
        });

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
        const searchOutcome = await searchCollections({
          token,
          endpoint,
          keyspace,
          isConnected,
          query,
          collection,
          collections,
          collectionsToSearch,
          userCollections,
          searchMode,
          sortField,
          sortDir,
          limit,
          filterField,
          filterOp,
          filterValue,
          embeddingVector,
        });
        searchResults = searchOutcome.searchResults;
        collection = searchOutcome.collection;

        send({
          step: "search", status: "complete",
          latencyMs: Date.now() - searchStart,
          data: {
            command: searchOutcome.commandStr,
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
        try {
          content = await generateResponse({
            watsonx,
            projectId,
            query,
            skipSearch,
            searchResults,
            allCollections,
            targetedCollections,
            userCollections,
            collection,
            allCollectionFields,
            collectionFields,
            history,
          });
        } catch (respErr) {
          const errMsg = respErr instanceof Error ? respErr.message : "Failed to generate response";
          send({ step: "respond", status: "error", latencyMs: Date.now() - respondStart, data: { error: errMsg } });
          return;
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
