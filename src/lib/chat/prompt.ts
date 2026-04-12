export function buildAnalyzePrompt(args: {
  collectionList: string;
  defaultCollection: string;
  fieldsSection: string;
  history?: { role: "user" | "assistant"; content: string }[];
  query: string;
}) {
  const { collectionList, defaultCollection, fieldsSection, history, query } =
    args;

  return `Analyze this database query and respond with JSON only (no markdown, no explanation, no code fences).

Available collections: ${collectionList}
Active collection: ${defaultCollection}
${fieldsSection}
${history && history.length > 0 ? `\nRecent conversation (for context only):\n${history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n")}\n` : ""}
Query: "${query}"

Rules (apply ALL that match):
1. "collection": pick the most relevant collection by matching the query topic/keywords against per-collection field names and collection names ONLY. IGNORE conversation history when choosing a collection — base it solely on which collection's fields best fit the query subject. Default to "${defaultCollection}" only if no collection is clearly more relevant.
2. "limit": if the user says "top N", "give me N", "N examples", etc., set this to N. Default 5.
3. "sortField": if the user says "highest X", "lowest X", "top by X", "best X", "ranked by X" — set to the snake_case field name. Prefer an exact match from the known fields list. Otherwise null.
4. "sortDir": "desc" for highest/best/top, "asc" for lowest/cheapest/worst. Default "desc".
5. "searchMode": "hybrid" by default unless query is purely keyword ("find exact phrase") → "lexical".
6. "intent": one sentence under 60 chars describing what the user wants.
7. "filterField": if the user wants to filter by a field value or condition, pick the most likely field from the known fields list. Otherwise null.
8. "filterOp": the comparison operator — "$eq" for exact matches (status, type, known enum values, or partial name searches like "named Eddie"), "$gt"/"$gte"/"$lt"/"$lte" for numeric comparisons, "$ne" for not-equal, "$in" for multiple values, "$nin" for exclusion, "$exists" to check presence. null if no filter.
9. "filterValue": the value to compare. For "$match" use the partial name/word as a string. Use a number for numeric ops. Use a JSON array for "$in"/"$nin". Use true/false for "$exists". Use the exact string for "$eq"/"$ne". null if no filter.
10. "skipSearch": true if this question can be fully answered without a database search — e.g. follow-up questions about results already shown ("which was cheapest?", "summarize those"), clarifications, general questions, OR schema/meta questions about the collection itself ("what fields are available?", "what does this collection contain?", "what can I ask about?"). false otherwise.
11. "allCollections": true ONLY if the query is explicitly broad/exploratory across ALL data — e.g. "tell me about my data", "what do I have", "what's in all my collections", "give me an overview of everything". false for any query targeting a specific topic, entity, or field, even if the best collection is unclear.
12. "collections": when the query mentions a field name or concept that appears in multiple specific collections (but NOT all), list only those relevant collections here as a JSON array of strings. Leave as null if rule 11 applies (allCollections) or if only one collection is relevant.

JSON format: {"collection": "...", "collections": null, "searchMode": "...", "intent": "...", "limit": 5, "sortField": null, "sortDir": "desc", "filterField": null, "filterOp": null, "filterValue": null, "skipSearch": false, "allCollections": false}`;
}
