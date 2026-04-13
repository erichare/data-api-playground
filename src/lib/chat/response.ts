import {
  generateText,
  type EnsureModelResult,
  streamText,
  type EnsureModelProgress,
  type ResolvedAiBackend,
  type TextGenerationChunk,
} from "@/lib/ai/service";
import { RESPOND_MAX_TOKENS } from "@/lib/chat/constants";
import type { SearchResult } from "@/lib/chat/types";

/**
 * Generate a natural language response from search results using the AI backend.
 *
 * Builds a system prompt scoped to the active collection(s), includes recent
 * conversation history, and handles several response modes: search results,
 * no-results, collection overview, and reformat follow-ups.
 * Supports both streaming (`onTextChunk`) and non-streaming modes.
 */
export async function generateResponse(args: {
  backend: ResolvedAiBackend;
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
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
  onTextChunk?: (chunk: TextGenerationChunk) => void;
}) {
  const {
    backend,
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
    onPrepareProgress,
    onPrepared,
    onTextChunk,
  } = args;

  const searchWasRun = !skipSearch;
  const noResults = searchWasRun && searchResults.length === 0;
  const resultContext =
    searchWasRun && searchResults.length > 0
      ? searchResults
          .map(
            (result, index) =>
              `[${index + 1}] id=${result.id} similarity=${result.similarity}\n${Object.entries(
                result.preview
              )
                .map(([key, value]) => `  ${key}: ${value}`)
                .join("\n")}`
          )
          .join("\n\n")
      : null;

  const scopeDesc = allCollections
    ? `ALL collections: ${userCollections.join(", ")}`
    : targetedCollections
      ? `collections: ${targetedCollections.join(", ")}`
      : `the "${collection}" collection`;
  const activeFields = targetedCollections
    ? targetedCollections.flatMap((name) => allCollectionFields[name] ?? [])
    : collectionFields;
  const systemPrompt = `You are a concise data analyst for an Astra DB playground. The user is exploring ${scopeDesc}.${!allCollections && activeFields && activeFields.length > 0 ? ` Known fields: ${activeFields.join(", ")}.` : ""} CRITICAL RULES: (1) Answer the question directly and immediately — your first sentence must be the answer. (2) Match the format the user asks for exactly: "one word" → one word; "table" → markdown table; "list" → bullet list; "briefly" → short. (3) NEVER output the raw source data you were given — do not echo field names, IDs, pipe-separated rows, or numbered result blocks. Use the data to derive your answer only. (4) Do NOT include lines like "[Search results shown to user:]", "[1] field: value", or any raw record dump in your response. (5) Only add analysis if the user explicitly asked for it. (6) ONLY describe data that was actually retrieved from the database. NEVER guess, infer, or fabricate what data might be in a collection based on its name or any other assumption. If no data was retrieved, say so — do not make up content.`;
  const collectionsSummary =
    skipSearch && allCollections && userCollections.length > 0
      ? `Your Astra DB collections:\n${userCollections
          .map((name) => {
            const fields = allCollectionFields[name];
            return `- ${name}${fields && fields.length > 0 ? `: fields — ${fields.join(", ")}` : ""}`;
          })
          .join("\n")}`
      : null;
  const isReformatFollowUp =
    skipSearch && !collectionsSummary && history && history.length > 0;

  const userContent = resultContext
    ? `User asked: "${query}"\n\nContext data from ${scopeDesc} (use this to answer — do not reproduce it):\n${resultContext}\n\nAnswer the question only. Do not output the raw records.`
    : noResults
      ? `User asked: "${query}"\n\nThe database search of ${scopeDesc} returned no results. Briefly note that no matching records were found in the searched collection(s). Do NOT guess or fabricate what the collection might contain based on its name. Instead, suggest the user try a different search query, check that the correct collection is selected, or verify that data has been ingested.${activeFields.length > 0 ? ` The known fields in this collection are: ${activeFields.join(", ")}.` : ""}`
      : collectionsSummary
        ? `User asked: "${query}"\n\n${collectionsSummary}\n\nAnswer using only the information above.`
        : isReformatFollowUp
          ? `The user is asking a follow-up or requesting a different format: "${query}"\n\nReformat or continue your previous response accordingly. Do not search the database again.`
          : query;

  const messages = [
    { role: "system", content: systemPrompt } as const,
    ...(history ?? []).slice(-10).map((message) => ({
      ...message,
      content: message.content
        .replace(/\n?\[Search results shown to user:\][\s\S]*/g, "")
        .replace(/\[End of Conversation\]/g, "")
        .trim(),
    })),
    { role: "user", content: userContent } as const,
  ];

  if (onTextChunk) {
    return streamText({
      backend,
      messages,
      maxTokens: RESPOND_MAX_TOKENS,
      onPrepareProgress,
      onPrepared,
      onChunk: onTextChunk,
    });
  }

  return generateText({
    backend,
    messages,
    maxTokens: RESPOND_MAX_TOKENS,
    onPrepareProgress,
    onPrepared,
  });
}
