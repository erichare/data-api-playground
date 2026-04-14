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
  if (!command) return "# No search was executed for this response";

  switch (lang) {
    case "ts": {
      const lines = command.split("\n");
      return `await db.collection("${collection ?? "…"}")\n${lines.slice(1).map((l) => "  " + l.trim()).join("\n")}`;
    }
    case "python": return toPythonCommand(command);
    case "java": return toJavaCommand(command);
    case "curl": return toCurlCommand(command, collection);
  }
}
