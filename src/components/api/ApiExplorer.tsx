"use client";

import { useCallback, useEffect, useState } from "react";
import type { Collection } from "@/lib/types";
import {
  ApiOperationsPanel,
  ApiRequestPanel,
  ApiResponsePanel,
} from "./ApiExplorerPanels";
import {
  createNetworkErrorResponse,
  getCode,
  getDefaultBody,
  getEndpointPath,
  normalizeProxyResponse,
  type ApiResponse,
  type ClientCallLogEntry,
  type CodeLang,
  type OpId,
} from "./apiExplorerShared";

const CLIENT_CALLS_URL = "/api/typescript-client-calls?limit=40";
const DATA_API_PROXY_URL = "/api/data-api-proxy";

interface ApiExplorerProps {
  collection?: Collection;
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
}

export function ApiExplorer({
  collection,
  astraToken,
  astraEndpoint,
  keyspace,
}: ApiExplorerProps) {
  const [selectedOp, setSelectedOp] = useState<OpId>("find");
  const [body, setBody] = useState(() => getDefaultBody("find", collection));
  const [codeLang, setCodeLang] = useState<CodeLang>("ts");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [bodyError, setBodyError] = useState("");
  const [clientCalls, setClientCalls] = useState<ClientCallLogEntry[]>([]);
  const [clientCallsLoading, setClientCallsLoading] = useState(true);

  const collectionName = collection?.name ?? "";
  const resolvedKeyspace = keyspace || "default_keyspace";

  const selectOp = useCallback(
    (op: OpId) => {
      setSelectedOp(op);
      setBody(getDefaultBody(op, collection));
      setBodyError("");
      setResponse(null);
    },
    [collection]
  );

  const loadClientCalls = useCallback(async () => {
    try {
      const response = await fetch(CLIENT_CALLS_URL);
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { calls?: ClientCallLogEntry[] };
      setClientCalls(data.calls ?? []);
    } catch {
      // Best-effort polling for the activity panel.
    } finally {
      setClientCallsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClientCalls();
    const intervalId = window.setInterval(() => {
      void loadClientCalls();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [loadClientCalls]);

  const run = async () => {
    if (!collectionName) {
      return;
    }

    setBodyError("");

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      setBodyError("Invalid JSON");
      return;
    }

    setRunning(true);
    setResponse(null);

    try {
      const response = await fetch(DATA_API_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: astraToken,
          endpoint: astraEndpoint,
          keyspace: resolvedKeyspace,
          collection: collectionName,
          requestBody: parsedBody,
        }),
      });
      const data = (await response.json()) as ApiResponse & { error?: string };
      setResponse(normalizeProxyResponse(data));
    } catch (error) {
      setResponse(createNetworkErrorResponse(error));
    } finally {
      setRunning(false);
      void loadClientCalls();
    }
  };

  const code = getCode(
    selectedOp,
    collectionName,
    body,
    codeLang,
    resolvedKeyspace
  );
  const responseJson = response ? JSON.stringify(response.data, null, 2) : null;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <ApiOperationsPanel selectedOp={selectedOp} onSelectOp={selectOp} />
      <ApiRequestPanel
        selectedOp={selectedOp}
        endpointPath={getEndpointPath(resolvedKeyspace, collectionName)}
        endpointCopyText={`${astraEndpoint}/api/json/v1/${resolvedKeyspace}/${collectionName}`}
        body={body}
        bodyError={bodyError}
        onBodyChange={(nextBody) => {
          setBody(nextBody);
          setBodyError("");
        }}
        running={running}
        hasCollection={Boolean(collectionName)}
        onRun={() => {
          void run();
        }}
        codeLang={codeLang}
        onCodeLangChange={setCodeLang}
        code={code}
      />
      <ApiResponsePanel
        response={response}
        responseJson={responseJson}
        running={running}
        clientCalls={clientCalls}
        clientCallsLoading={clientCallsLoading}
      />
    </div>
  );
}
