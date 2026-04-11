import {
  generateText,
  type EnsureModelProgress,
  type ResolvedAiBackend,
} from "@/lib/ai/service";
import { RESPOND_MAX_TOKENS } from "@/lib/chat/constants";
import type { SearchResult } from "@/lib/chat/types";

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
  const systemPrompt = `You are a concise data analyst for an Astra DB playground. The user is exploring ${scopeDesc}.${!allCollections && activeFields && activeFields.length > 0 ? ` Known fields: ${activeFields.join(", ")}.` : ""} CRITICAL RULES: (1) Answer the question directly and immediately — your first sentence must be the answer. (2) Match the format the user asks for exactly: "one word" → one word; "table" → markdown table; "list" → bullet list; "briefly" → short. (3) NEVER output the raw source data you were given — do not echo field names, IDs, pipe-separated rows, or numbered result blocks. Use the data to derive your answer only. (4) Do NOT include lines like "[Search results shown to user:]", "[1] field: value", or any raw record dump in your response. (5) Only add analysis if the user explicitly asked for it.`;
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
      ? `User asked: "${query}"\n\nThe database search of ${scopeDesc} returned no results. Start your response by briefly noting no matching records were found, then answer from your general knowledge if applicable.`
      : collectionsSummary
        ? `User asked: "${query}"\n\n${collectionsSummary}\n\nAnswer using only the information above.`
        : isReformatFollowUp
          ? `The user is asking a follow-up or requesting a different format: "${query}"\n\nReformat or continue your previous response accordingly. Do not search the database again.`
          : query;

  return generateText({
    backend,
    messages: [
      { role: "system", content: systemPrompt },
      ...(history ?? []).slice(-10).map((message) => ({
        ...message,
        content: message.content
          .replace(/\n?\[Search results shown to user:\][\s\S]*/g, "")
          .replace(/\[End of Conversation\]/g, "")
          .trim(),
      })),
      { role: "user", content: userContent },
    ],
    maxTokens: RESPOND_MAX_TOKENS,
    onPrepareProgress,
  });
}
