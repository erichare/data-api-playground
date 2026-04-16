/**
 * Multi-language code generators for search commands.
 *
 * Translates the TypeScript search command captured during the RAG pipeline
 * into equivalent Python (astrapy), Java (astra-db-java), and cURL snippets.
 */
import type { PipelineStep } from "@/lib/types";

export type CodeLang = "ts" | "python" | "java" | "curl";

export const LANG_LABELS: Record<CodeLang, string> = {
  ts: "TypeScript",
  python: "Python",
  java: "Java",
  curl: "cURL",
};

export const LANG_SDK: Record<CodeLang, string> = {
  ts: "astra-db-ts",
  python: "astrapy",
  java: "astra-db-java",
  curl: "Data API",
};

interface TypeScriptCommandContext {
  collection?: string;
  collections?: string[];
}

function indent(text: string, spaces: number) {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function trimMultilineValue(value: string) {
  const lines = value
    .trim()
    .split("\n")
    .map((line) => line.trimEnd());

  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  const minIndent = nonEmpty.reduce((smallest, line) => {
    const indentSize = line.match(/^\s*/)?.[0].length ?? 0;
    return Math.min(smallest, indentSize);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return lines.join("\n");
  }

  return lines.map((line) => line.slice(minIndent)).join("\n");
}

function splitTopLevelArgs(rawArgs: string) {
  const args: string[] = [];
  let current = "";
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (const char of rawArgs) {
    current += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (inSingle) {
      if (char === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      if (char === "\"") inDouble = false;
      continue;
    }

    if (inTemplate) {
      if (char === "`") inTemplate = false;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      continue;
    }

    if (char === "\"") {
      inDouble = true;
      continue;
    }

    if (char === "`") {
      inTemplate = true;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth -= 1;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth -= 1;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth -= 1;
      continue;
    }

    if (
      char === "," &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      args.push(trimMultilineValue(current.slice(0, -1)));
      current = "";
    }
  }

  const finalArg = trimMultilineValue(current);
  if (finalArg.length > 0) {
    args.push(finalArg);
  }

  return args;
}

function extractMethodArgs(tsCmd: string, method: string) {
  const startToken = `.${method}(`;
  const start = tsCmd.indexOf(startToken);
  if (start === -1) {
    return null;
  }

  let cursor = start + startToken.length;
  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  let rawArgs = "";

  while (cursor < tsCmd.length) {
    const char = tsCmd.charAt(cursor);

    if (escaped) {
      rawArgs += char;
      escaped = false;
      cursor += 1;
      continue;
    }

    if (char === "\\") {
      rawArgs += char;
      escaped = true;
      cursor += 1;
      continue;
    }

    if (inSingle) {
      rawArgs += char;
      if (char === "'") inSingle = false;
      cursor += 1;
      continue;
    }

    if (inDouble) {
      rawArgs += char;
      if (char === "\"") inDouble = false;
      cursor += 1;
      continue;
    }

    if (inTemplate) {
      rawArgs += char;
      if (char === "`") inTemplate = false;
      cursor += 1;
      continue;
    }

    if (char === "'") {
      rawArgs += char;
      inSingle = true;
      cursor += 1;
      continue;
    }

    if (char === "\"") {
      rawArgs += char;
      inDouble = true;
      cursor += 1;
      continue;
    }

    if (char === "`") {
      rawArgs += char;
      inTemplate = true;
      cursor += 1;
      continue;
    }

    if (char === "(") {
      rawArgs += char;
      depth += 1;
      cursor += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return splitTopLevelArgs(rawArgs);
      }
      rawArgs += char;
      cursor += 1;
      continue;
    }

    rawArgs += char;
    cursor += 1;
  }

  return null;
}

function formatTypeScriptInvocation(method: string, args: string[]) {
  if (args.length === 0) {
    return `collection.${method}()`;
  }

  const inline = args.join(", ");
  if (
    method !== "findAndRerank" &&
    inline.length <= 60 &&
    args.every((arg) => !arg.includes("\n"))
  ) {
    return `collection.${method}(${inline})`;
  }

  return `collection.${method}(\n${args
    .map((arg) => indent(arg, 2))
    .join(",\n")}\n)`;
}

function extractLeadingCommentBlock(command: string) {
  const lines = command.trim().split("\n");
  const commentLines: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines.at(index);
    if (!line?.trimStart().startsWith("//")) {
      break;
    }

    commentLines.push(line.trimEnd());
    index += 1;
  }

  return {
    comment: commentLines.join("\n"),
    command: lines.slice(index).join("\n").trim(),
  };
}

function buildGenericVectorSearchSnippet(context: TypeScriptCommandContext) {
  const collections = context.collections?.filter(Boolean) ?? [];

  if (collections.length > 1) {
    return [
      `const collections = ${JSON.stringify(collections)};`,
      "",
      "const resultsByCollection = await Promise.all(",
      "  collections.map(async (name) => {",
      "    const collection = db.collection(name);",
      "    const documents = await collection.find(",
      "      {},",
      "      {",
      "        sort: { $vector: embedding },",
      "        limit: 5,",
      "        includeSimilarity: true,",
      "      }",
      "    ).toArray();",
      "",
      "    return { collection: name, documents };",
      "  })",
      ");",
    ].join("\n");
  }

  const collectionName = collections[0] ?? context.collection ?? "…";
  return [
    `const collection = db.collection("${collectionName}");`,
    "",
    "const results = await collection.find(",
    "  {},",
    "  {",
    "    sort: { $vector: embedding },",
    "    limit: 5,",
    "    includeSimilarity: true,",
    "  }",
    ").toArray();",
  ].join("\n");
}

export function toTypeScriptCommand(
  tsCmd: string,
  context: TypeScriptCommandContext = {}
): string {
  const trimmed = tsCmd.trim();
  if (trimmed.length === 0) {
    return "// No search was executed for this response";
  }
  const { comment, command } = extractLeadingCommentBlock(trimmed);
  const source = command || trimmed;

  if (source.includes("openrag.search.query(")) {
    const formatted = source.startsWith("const results =")
      ? source
      : `const results = ${source.replace(/;?$/, ";")}`;
    return comment ? `${comment}\n${formatted}` : formatted;
  }

  const collectionName =
    source.match(/db\.collection\("([^"]+)"\)/)?.[1] ?? context.collection ?? "…";

  if (!source.includes(".findAndRerank(") && !source.includes(".find(")) {
    const fallback = buildGenericVectorSearchSnippet(context);
    return comment ? `${comment}\n${fallback}` : fallback;
  }

  if (source.includes(".findAndRerank(")) {
    const args = extractMethodArgs(source, "findAndRerank");
    if (!args) {
      return comment ? `${comment}\n${source}` : source;
    }

    const formatted = [
      `const collection = db.collection("${collectionName}");`,
      "",
      `const cursor = ${formatTypeScriptInvocation("findAndRerank", args)};`,
      "const results = await cursor.toArray();",
    ].join("\n");
    return comment ? `${comment}\n${formatted}` : formatted;
  }

  if (source.includes(".find(")) {
    const args = extractMethodArgs(source, "find");
    if (!args) {
      return comment ? `${comment}\n${source}` : source;
    }

    const formatted = [
      `const collection = db.collection("${collectionName}");`,
      "",
      `const results = await ${formatTypeScriptInvocation("find", args)}.toArray();`,
    ].join("\n");
    return comment ? `${comment}\n${formatted}` : formatted;
  }

  return comment ? `${comment}\n${source}` : source;
}

export function toPythonCommand(tsCmd: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  if (tsCmd.includes(".findAndRerank(")) {
    return `collection.find_and_rerank(\n    {},\n    sort={"$hybrid": {"$vectorize": query}},\n    limit=${limit}\n)`;
  }
  if (tsCmd.includes("$vectorize")) {
    return `collection.find(\n    {},\n    sort={"$vectorize": query},\n    limit=${limit},\n    include_similarity=True\n)`;
  }
  if (tsCmd.includes("$vector")) {
    return `collection.find(\n    {},\n    sort={"$vector": embedding},\n    limit=${limit},\n    include_similarity=True\n)`;
  }
  const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
  if (sortMatch) {
    const dir = sortMatch[2] === "1" ? "ASCENDING" : "DESCENDING";
    return `from astrapy.constants import SortDocuments\ncollection.find(\n    {},\n    sort={"${sortMatch[1]}": SortDocuments.${dir}},\n    limit=${limit}\n)`;
  }
  return `collection.find({}, limit=${limit})`;
}

export function toJavaCommand(tsCmd: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  if (tsCmd.includes(".findAndRerank(")) {
    return `collection.findAndRerank(\n    Filter.empty(),\n    new FindOneAndRerankOptions()\n        .sort(Sorts.hybrid(query))\n        .limit(${limit})\n)`;
  }
  if (tsCmd.includes("$vectorize")) {
    return `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.vectorize(query))\n        .limit(${limit})\n)`;
  }
  if (tsCmd.includes("$vector")) {
    return `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.vector(embedding))\n        .limit(${limit})\n)`;
  }
  const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
  if (sortMatch) {
    const dir = sortMatch[2] === "1" ? "ascending" : "descending";
    return `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.${dir}("${sortMatch[1]}"))\n        .limit(${limit})\n)`;
  }
  return `collection.find(Filter.empty(), new FindOptions().limit(${limit}))`;
}

export function toCurlCommand(tsCmd: string, collection?: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  const col = collection ?? "<COLLECTION>";
  const endpoint = `"$ASTRA_DB_API_ENDPOINT/api/json/v1/$KEYSPACE/${col}"`;
  const headers = `-H "Token: $ASTRA_DB_APPLICATION_TOKEN" \\\n  -H "Content-Type: application/json"`;

  let body: string;
  if (tsCmd.includes(".findAndRerank(")) {
    body = JSON.stringify({
      findAndRerank: {
        filter: {},
        sort: { $hybrid: { $vectorize: "<query>" } },
        options: { limit: Number(limit) },
      }
    }, null, 2);
  } else if (tsCmd.includes("$vectorize")) {
    body = JSON.stringify({
      find: {
        filter: {},
        sort: { $vectorize: "<query>" },
        options: { limit: Number(limit), includeSimilarity: true },
      }
    }, null, 2);
  } else if (tsCmd.includes("$vector")) {
    body = JSON.stringify({
      find: {
        filter: {},
        sort: { $vector: ["<embedding>"] },
        options: { limit: Number(limit), includeSimilarity: true },
      }
    }, null, 2);
  } else {
    const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
    if (sortMatch) {
      body = JSON.stringify({
        find: {
          filter: {},
          sort: { [sortMatch[1]]: Number(sortMatch[2]) },
          options: { limit: Number(limit) },
        }
      }, null, 2);
    } else {
      body = JSON.stringify({ find: { filter: {}, options: { limit: Number(limit) } } }, null, 2);
    }
  }

  return `curl -X POST ${endpoint} \\\n  ${headers} \\\n  -d '${body}'`;
}

export function getCodeForLang(lang: CodeLang, searchStep?: PipelineStep): string {
  const command = searchStep?.data?.command as string | undefined;
  const collection = searchStep?.data?.collection as string | undefined;
  const collections = searchStep?.data?.collections as string[] | undefined;
  if (!command) return "# No search was executed for this response";

  switch (lang) {
    case "ts": return toTypeScriptCommand(command, { collection, collections });
    case "python": return toPythonCommand(command);
    case "java": return toJavaCommand(command);
    case "curl": return toCurlCommand(command, collection);
  }
}
