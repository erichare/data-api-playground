"use client";
/* eslint-disable security/detect-object-injection -- Code preview selects from typed language/style maps using constrained keys. */

import { useState } from "react";
import {
  type CodeLang,
  type CollectionMetric,
  type CollectionMode,
} from "@/components/collection/collectionFormShared";

const I = (n: number) => ({ paddingLeft: `${n * 1.2}em` });
const T = {
  base: "var(--text-secondary)",
  kw: "var(--interactive)",
  ident: "var(--step-analyze)",
  method: "var(--step-embed)",
  str: "var(--step-respond)",
  num: "#818cf8",
};

const LANG_LABELS: Record<CodeLang, string> = {
  ts: "TS",
  python: "Py",
  java: "Java",
  curl: "cURL",
};

const LANG_NAMES: Record<CodeLang, string> = {
  ts: "astra-db-ts",
  python: "astrapy · python",
  java: "astra-db-java",
  curl: "Data API",
};

interface CollectionCodePreviewProps {
  name: string;
  dimension: number;
  metric: CollectionMetric;
  mode: CollectionMode;
  provider: string;
  model: string;
}

export function CollectionCodePreview({
  name,
  dimension,
  metric,
  mode,
  provider,
  model,
}: CollectionCodePreviewProps) {
  const [lang, setLang] = useState<CodeLang>("ts");
  const displayName = name || "my_collection";
  const metricUpper = metric.toUpperCase();
  const curlBody =
    mode === "vectorize"
      ? `{
    "createCollection": {
      "name": "${displayName}",
      "options": {
        "vector": {
          "service": {
            "provider": "${provider}",
            "modelName": "${model}"
          }
        }
      }
    }
  }`
      : `{
    "createCollection": {
      "name": "${displayName}",
      "options": {
        "vector": {
          "dimension": ${dimension},
          "metric": "${metric}"
        }
      }
    }
  }`;

  return (
    <div
      className="rounded-lg overflow-hidden text-[12px] leading-relaxed"
      style={{
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border-subtle)",
        fontFamily: "IBM Plex Mono, monospace",
      }}
    >
      <div
        className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b"
        style={{
          borderColor: "var(--border-subtle)",
          backgroundColor: "var(--bg-panel)",
        }}
      >
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          {LANG_NAMES[lang]}
        </span>
        <div className="flex gap-0.5">
          {(Object.keys(LANG_LABELS) as CodeLang[]).map((nextLang) => (
            <button
              key={nextLang}
              onClick={() => setLang(nextLang)}
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor:
                  lang === nextLang ? "var(--interactive-light)" : "transparent",
                color:
                  lang === nextLang ? "var(--interactive)" : "var(--text-muted)",
                border:
                  lang === nextLang
                    ? "1px solid var(--interactive-border)"
                    : "1px solid transparent",
              }}
            >
              {LANG_LABELS[nextLang]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2.5 overflow-x-auto">
        {lang === "ts" && (
          <>
            <div style={I(0)}>
              <span style={{ color: T.kw }}>await </span>
              <span style={{ color: T.ident }}>db</span>
              <span style={{ color: T.base }}>.</span>
              <span style={{ color: T.method }}>createCollection</span>
              <span style={{ color: T.base }}>(</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.str }}>&quot;{displayName}&quot;</span>
              <span style={{ color: T.base }}>, &#123;</span>
            </div>
            <div style={I(2)}>
              <span style={{ color: T.base }}>vector: &#123;</span>
            </div>
            {mode === "vectorize" ? (
              <>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>service: &#123;</span>
                </div>
                <div style={I(4)}>
                  <span style={{ color: T.base }}>provider: </span>
                  <span style={{ color: T.str }}>&quot;{provider}&quot;</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
                <div style={I(4)}>
                  <span style={{ color: T.base }}>modelName: </span>
                  <span style={{ color: T.str }}>&quot;{model}&quot;</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>&#125;,</span>
                </div>
              </>
            ) : (
              <>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>dimension: </span>
                  <span style={{ color: T.num }}>{dimension}</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>metric: </span>
                  <span style={{ color: T.str }}>&quot;{metric}&quot;</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
              </>
            )}
            <div style={I(2)}>
              <span style={{ color: T.base }}>&#125;,</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.base }}>&#125;</span>
            </div>
            <div style={I(0)}>
              <span style={{ color: T.base }}>)</span>
            </div>
          </>
        )}

        {lang === "python" && (
          <>
            <div style={I(0)}>
              <span style={{ color: T.kw }}>await </span>
              <span style={{ color: T.ident }}>db</span>
              <span style={{ color: T.base }}>.</span>
              <span style={{ color: T.method }}>create_collection</span>
              <span style={{ color: T.base }}>(</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.str }}>&quot;{displayName}&quot;</span>
              <span style={{ color: T.base }}>,</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.base }}>definition=</span>
              <span style={{ color: T.ident }}>CollectionDefinition</span>
              <span style={{ color: T.base }}>(</span>
            </div>
            <div style={I(2)}>
              <span style={{ color: T.base }}>vector=</span>
              <span style={{ color: T.ident }}>CollectionVectorOptions</span>
              <span style={{ color: T.base }}>(</span>
            </div>
            {mode === "vectorize" ? (
              <>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>service=</span>
                  <span style={{ color: T.ident }}>VectorServiceOptions</span>
                  <span style={{ color: T.base }}>(</span>
                </div>
                <div style={I(4)}>
                  <span style={{ color: T.base }}>provider=</span>
                  <span style={{ color: T.str }}>&quot;{provider}&quot;</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
                <div style={I(4)}>
                  <span style={{ color: T.base }}>model_name=</span>
                  <span style={{ color: T.str }}>&quot;{model}&quot;</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>),</span>
                </div>
              </>
            ) : (
              <>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>dimension=</span>
                  <span style={{ color: T.num }}>{dimension}</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>metric=</span>
                  <span style={{ color: T.ident }}>VectorMetric</span>
                  <span style={{ color: T.base }}>.</span>
                  <span style={{ color: T.str }}>{metricUpper}</span>
                  <span style={{ color: T.base }}>,</span>
                </div>
              </>
            )}
            <div style={I(2)}>
              <span style={{ color: T.base }}>),</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.base }}>),</span>
            </div>
            <div style={I(0)}>
              <span style={{ color: T.base }}>)</span>
            </div>
          </>
        )}

        {lang === "java" && (
          <>
            <div style={I(0)}>
              <span style={{ color: T.ident }}>db</span>
              <span style={{ color: T.base }}>.</span>
              <span style={{ color: T.method }}>createCollection</span>
              <span style={{ color: T.base }}>(</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.str }}>&quot;{displayName}&quot;</span>
              <span style={{ color: T.base }}>,</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.ident }}>CollectionDefinition</span>
              <span style={{ color: T.base }}>.builder()</span>
            </div>
            <div style={I(2)}>
              <span style={{ color: T.base }}>.vector(</span>
              <span style={{ color: T.ident }}>CollectionVectorDefinition</span>
              <span style={{ color: T.base }}>.builder()</span>
            </div>
            {mode === "vectorize" ? (
              <>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>.service(</span>
                  <span style={{ color: T.ident }}>
                    CollectionVectorServiceDefinition
                  </span>
                  <span style={{ color: T.base }}>.builder()</span>
                </div>
                <div style={I(4)}>
                  <span style={{ color: T.base }}>.provider(</span>
                  <span style={{ color: T.str }}>&quot;{provider}&quot;</span>
                  <span style={{ color: T.base }}>)</span>
                </div>
                <div style={I(4)}>
                  <span style={{ color: T.base }}>.modelName(</span>
                  <span style={{ color: T.str }}>&quot;{model}&quot;</span>
                  <span style={{ color: T.base }}>)</span>
                </div>
                <div style={I(4)}>
                  <span style={{ color: T.base }}>.build())</span>
                </div>
              </>
            ) : (
              <>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>.dimension(</span>
                  <span style={{ color: T.num }}>{dimension}</span>
                  <span style={{ color: T.base }}>)</span>
                </div>
                <div style={I(3)}>
                  <span style={{ color: T.base }}>.metric(</span>
                  <span style={{ color: T.ident }}>SimilarityMetric</span>
                  <span style={{ color: T.base }}>.</span>
                  <span style={{ color: T.str }}>{metricUpper}</span>
                  <span style={{ color: T.base }}>)</span>
                </div>
              </>
            )}
            <div style={I(2)}>
              <span style={{ color: T.base }}>.build())</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.base }}>.build()</span>
            </div>
            <div style={I(0)}>
              <span style={{ color: T.base }}>)</span>
            </div>
          </>
        )}

        {lang === "curl" && (
          <>
            <div style={I(0)}>
              <span style={{ color: T.kw }}>curl</span>
              <span style={{ color: T.base }}> -X POST </span>
              <span style={{ color: T.str }}>
                &quot;$ASTRA_DB_API_ENDPOINT/api/json/v1/$KEYSPACE&quot;
              </span>
              <span style={{ color: T.base }}> \</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.base }}>-H </span>
              <span style={{ color: T.str }}>
                &quot;Token: $ASTRA_DB_APPLICATION_TOKEN&quot;
              </span>
              <span style={{ color: T.base }}> \</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.base }}>-H </span>
              <span style={{ color: T.str }}>&quot;Content-Type: application/json&quot;</span>
              <span style={{ color: T.base }}> \</span>
            </div>
            <div style={I(1)}>
              <span style={{ color: T.base }}>-d </span>
              <span style={{ color: T.str }}>&apos;{curlBody}&apos;</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
