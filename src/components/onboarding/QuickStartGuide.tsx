"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check } from "lucide-react";

interface QuickStartGuideProps {
  open: boolean;
  onClose: () => void;
}

type Lang = "python" | "typescript" | "java" | "curl";

const LANGS: { id: Lang; label: string; icon: string }[] = [
  { id: "python",     label: "Python",     icon: "🐍" },
  { id: "typescript", label: "TypeScript", icon: "📘" },
  { id: "java",       label: "Java",       icon: "☕" },
  { id: "curl",       label: "cURL",       icon: "🌐" },
];

interface Step {
  title: string;
  description: string;
  code: Record<Lang, string>;
}

const STEPS: Step[] = [
  {
    title: "Install",
    description: "Add the Astra DB client to your project.",
    code: {
      python:     `pip install astrapy`,
      typescript: `npm install @datastax/astra-db-ts`,
      java: `<!-- pom.xml -->
<dependency>
  <groupId>com.datastax.astra</groupId>
  <artifactId>astra-db-java</artifactId>
  <version>2.x</version>
</dependency>`,
      curl: `# No installation needed — use curl or any HTTP client`,
    },
  },
  {
    title: "Connect",
    description: "Initialise the client with your token and endpoint.",
    code: {
      python: `from astrapy import DataAPIClient

client = DataAPIClient("AstraCS:YOUR_TOKEN")
db = client.get_database("https://YOUR_ID.apps.astra.datastax.com")`,
      typescript: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient("AstraCS:YOUR_TOKEN");
const db = client.db("https://YOUR_ID.apps.astra.datastax.com");`,
      java: `import com.datastax.astra.client.DataAPIClient;
import com.datastax.astra.client.databases.Database;

DataAPIClient client = new DataAPIClient("AstraCS:YOUR_TOKEN");
Database db = client.getDatabase("https://YOUR_ID.apps.astra.datastax.com");`,
      curl: `# Set your credentials
export TOKEN="AstraCS:YOUR_TOKEN"
export ENDPOINT="https://YOUR_ID.apps.astra.datastax.com"`,
    },
  },
  {
    title: "Create Collection",
    description: "Create a vector-enabled collection for semantic search.",
    code: {
      python: `collection = db.create_collection(
    "my_collection",
    dimension=768,
    metric="cosine",
)`,
      typescript: `const collection = await db.createCollection("my_collection", {
  vector: { dimension: 768, metric: "cosine" },
});`,
      java: `import com.datastax.astra.client.collections.Collection;
import com.datastax.astra.client.collections.definition.CollectionDefinition;
import com.datastax.astra.client.core.vector.SimilarityMetric;

Collection<Document> col = db.createCollection(
    "my_collection",
    new CollectionDefinition()
        .vector(768, SimilarityMetric.COSINE)
);`,
      curl: `curl -X POST "$ENDPOINT/api/json/v1/default_keyspace" \\
  -H "Token: $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "createCollection": {
      "name": "my_collection",
      "options": { "vector": { "dimension": 768, "metric": "cosine" } }
    }
  }'`,
    },
  },
  {
    title: "Insert Documents",
    description: "Insert documents with optional vector embeddings.",
    code: {
      python: `collection.insert_many([
    {"_id": "1", "name": "Alice", "$vector": [0.1, 0.2, 0.3]},
    {"_id": "2", "name": "Bob",   "$vector": [0.4, 0.5, 0.6]},
])`,
      typescript: `await collection.insertMany([
  { _id: "1", name: "Alice", $vector: [0.1, 0.2, 0.3] },
  { _id: "2", name: "Bob",   $vector: [0.4, 0.5, 0.6] },
]);`,
      java: `import com.datastax.astra.client.collections.documents.Document;

col.insertMany(List.of(
    new Document("1").append("name", "Alice")
                     .vector(new float[]{0.1f, 0.2f, 0.3f}),
    new Document("2").append("name", "Bob")
                     .vector(new float[]{0.4f, 0.5f, 0.6f})
));`,
      curl: `curl -X POST "$ENDPOINT/api/json/v1/default_keyspace/my_collection" \\
  -H "Token: $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "insertMany": {
      "documents": [
        {"_id": "1", "name": "Alice", "$vector": [0.1, 0.2, 0.3]},
        {"_id": "2", "name": "Bob",   "$vector": [0.4, 0.5, 0.6]}
      ]
    }
  }'`,
    },
  },
  {
    title: "Vector Search",
    description: "Find the most semantically similar documents.",
    code: {
      python: `results = collection.find(
    sort={"$vector": [0.1, 0.2, 0.3]},
    limit=5,
    include_similarity=True,
)
for doc in results:
    print(doc)`,
      typescript: `const results = await collection.find({}, {
  sort: { $vector: [0.1, 0.2, 0.3] },
  limit: 5,
  includeSimilarity: true,
}).toArray();`,
      java: `import static com.datastax.astra.client.core.query.Sort.vector;

col.find(null,
    new FindOptions()
        .sort(vector(new float[]{0.1f, 0.2f, 0.3f}))
        .limit(5)
        .includeSimilarity(true)
).forEach(System.out::println);`,
      curl: `curl -X POST "$ENDPOINT/api/json/v1/default_keyspace/my_collection" \\
  -H "Token: $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "find": {
      "sort": { "$vector": [0.1, 0.2, 0.3] },
      "options": { "limit": 5, "includeSimilarity": true }
    }
  }'`,
    },
  },
  {
    title: "Hybrid Search",
    description: "Combine vector and keyword search with automatic reranking.",
    code: {
      python: `# Requires a collection with $vectorize (server-side embeddings)
results = collection.find_and_rerank(
    sort={"$hybrid": "semantic and keyword query"},
    limit=5,
)
for result in results:
    print(result.document, result.scores)`,
      typescript: `// Requires a collection with $vectorize (server-side embeddings)
const cursor = collection.findAndRerank({}, {
  sort: { $hybrid: "semantic and keyword query" },
  limit: 5,
});
for await (const result of cursor) {
  console.log(result.document, result.scores);
}`,
      java: `// Requires a collection with vectorize (server-side embeddings)
col.findAndRerank(null,
    new FindAndRerankOptions()
        .sort(Sort.hybrid("semantic and keyword query"))
        .limit(5)
).forEach(r -> System.out.println(r.getDocument()));`,
      curl: `curl -X POST "$ENDPOINT/api/json/v1/default_keyspace/my_collection" \\
  -H "Token: $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "findAndRerank": {
      "sort": { "$hybrid": "semantic and keyword query" },
      "options": { "limit": 5 }
    }
  }'`,
    },
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="relative group rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}
    >
      <button
        onClick={handleCopy}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          backgroundColor: "var(--bg-hover)",
          color: copied ? "#4ade80" : "var(--text-muted)",
        }}
        title="Copy to clipboard"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <pre
        className="text-[12px] leading-relaxed px-4 py-3.5 overflow-x-auto"
        style={{
          fontFamily: "IBM Plex Mono, monospace",
          color: "var(--text-secondary)",
          whiteSpace: "pre",
        }}
      >
        {code.split("\n").map((line, i) => (
          <div key={i}>
            {line
              .split(/(\b(?:import|from|const|let|var|await|async|new|return|for|if|class|public|static|void|List|of)\b|"[^"]*"|'[^']*'|`[^`]*`|#[^\n]*|\/\/[^\n]*)/)
              .map((part, j) => {
                if (/^(import|from|const|let|var|await|async|new|return|for|if|class|public|static|void|List|of)$/.test(part))
                  return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
                if (/^["'`]/.test(part))
                  return <span key={j} style={{ color: "#4ade80" }}>{part}</span>;
                if (/^(#|\/\/)/.test(part))
                  return <span key={j} style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{part}</span>;
                return <span key={j}>{part}</span>;
              })}
          </div>
        ))}
      </pre>
    </div>
  );
}

export function QuickStartGuide({ open, onClose }: QuickStartGuideProps) {
  const [lang, setLang] = useState<Lang>("python");

  // Per-language accent colours — intentional visual differentiation, kept fixed
  const langColors: Record<Lang, string> = {
    python:     "#fbbf24",
    typescript: "#3b82f6",
    java:       "#f97316",
    curl:       "#a78bfa",
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)" }}
          />
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full z-50 flex flex-col"
            style={{
              width: "min(680px, 95vw)",
              backgroundColor: "var(--bg-panel)",
              borderLeft: "1px solid var(--border-subtle)",
              boxShadow: "-24px 0 64px rgba(0,0,0,0.35)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Quick Start Guide</h2>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>Top Astra DB Data API commands</p>
              </div>
              <motion.button
                onClick={onClose}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0)" }}
                whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}
                whileTap={{ scale: 0.9 }}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Language selector */}
            <div
              className="flex gap-1.5 px-6 py-3 border-b shrink-0"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-card)" }}
            >
              {LANGS.map((l) => (
                <motion.button
                  key={l.id}
                  onClick={() => setLang(l.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: lang === l.id ? `${langColors[l.id]}18` : "transparent",
                    border: `1px solid ${lang === l.id ? `${langColors[l.id]}50` : "transparent"}`,
                    color: lang === l.id ? langColors[l.id] : "var(--text-muted)",
                  }}
                  whileHover={{ color: lang === l.id ? langColors[l.id] : "var(--text-secondary)" }}
                  whileTap={{ scale: 0.96 }}
                >
                  <span>{l.icon}</span>
                  {l.label}
                </motion.button>
              ))}
            </div>

            {/* Steps */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex flex-col gap-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{
                        backgroundColor: `${langColors[lang]}18`,
                        color: langColors[lang],
                        border: `1px solid ${langColors[lang]}30`,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{step.title}</span>
                      <span className="text-[12px] ml-2" style={{ color: "var(--text-muted)" }}>{step.description}</span>
                    </div>
                  </div>
                  <div className="ml-8">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={lang}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                      >
                        <CodeBlock code={step.code[lang]} />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}

              {/* Footer links */}
              <div className="flex gap-3 pt-2 pb-4">
                {[
                  { label: "Full Docs", href: "https://docs.datastax.com/en/astra-db-serverless/api-reference/overview.html" },
                  { label: "Python SDK", href: "https://github.com/datastax/astrapy" },
                  { label: "TS SDK", href: "https://github.com/datastax/astra-db-ts" },
                  { label: "Java SDK", href: "https://github.com/datastax/astra-db-java" },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-muted)",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
