"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BackendConnectionState } from "@/lib/backends/types";
import { buildConnectionRequestBody } from "@/lib/backends/types";
import type { Collection } from "@/lib/types";
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
} from "@/components/api/apiExplorerConfig";

const DEFAULT_CLIENT_CALLS_URL = "/api/typescript-client-calls?limit=40";
const DEFAULT_DATA_API_PROXY_URL = "/api/data-api-proxy";
const DEFAULT_KEYSPACE = "default_keyspace";

interface UseApiExplorerSessionArgs {
  collection?: Collection;
  connection?: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace: string;
  clientCallsUrl?: string;
  dataApiProxyUrl?: string;
  pollMs?: number;
}

export function useApiExplorerSession({
  collection,
  connection,
  astraToken,
  astraEndpoint,
  keyspace,
  clientCallsUrl = DEFAULT_CLIENT_CALLS_URL,
  dataApiProxyUrl = DEFAULT_DATA_API_PROXY_URL,
  pollMs = 2000,
}: UseApiExplorerSessionArgs) {
  const resolvedConnection = useMemo(
    () =>
      connection ??
      (astraToken || astraEndpoint
        ? {
            backend: "astra" as const,
            token: astraToken ?? "",
            endpoint: astraEndpoint ?? "",
          }
        : null),
    [astraEndpoint, astraToken, connection]
  );
  const [selectedOp, setSelectedOp] = useState<OpId>("find");
  const [body, setBody] = useState(() => getDefaultBody("find", collection));
  const [codeLang, setCodeLang] = useState<CodeLang>("ts");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [bodyError, setBodyError] = useState("");
  const [clientCalls, setClientCalls] = useState<ClientCallLogEntry[]>([]);
  const [clientCallsLoading, setClientCallsLoading] = useState(true);

  const collectionName = collection?.name ?? "";
  const resolvedKeyspace = keyspace || DEFAULT_KEYSPACE;

  const selectOp = useCallback(
    (op: OpId) => {
      setSelectedOp(op);
      setBody(getDefaultBody(op, collection));
      setBodyError("");
      setResponse(null);
    },
    [collection]
  );

  const updateBody = useCallback((nextBody: string) => {
    setBody(nextBody);
    setBodyError("");
  }, []);

  const loadClientCalls = useCallback(async () => {
    try {
      const clientCallsResponse = await fetch(clientCallsUrl);
      if (!clientCallsResponse.ok) {
        return;
      }

      const data = (await clientCallsResponse.json()) as {
        calls?: ClientCallLogEntry[];
      };
      setClientCalls(data.calls ?? []);
    } catch {
      // Best-effort polling for the activity panel.
    } finally {
      setClientCallsLoading(false);
    }
  }, [clientCallsUrl]);

  useEffect(() => {
    void loadClientCalls();
    const intervalId = window.setInterval(() => {
      void loadClientCalls();
    }, pollMs);

    return () => window.clearInterval(intervalId);
  }, [loadClientCalls, pollMs]);

  const run = useCallback(async () => {
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
      const proxyResponse = await fetch(dataApiProxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildConnectionRequestBody(resolvedConnection, { keyspace: resolvedKeyspace }),
          collection: collectionName,
          requestBody: parsedBody,
        }),
      });
      const data = (await proxyResponse.json()) as ApiResponse & { error?: string };
      setResponse(normalizeProxyResponse(data));
    } catch (error) {
      setResponse(createNetworkErrorResponse(error));
    } finally {
      setRunning(false);
      void loadClientCalls();
    }
  }, [
    body,
    collectionName,
    dataApiProxyUrl,
    loadClientCalls,
    resolvedKeyspace,
    resolvedConnection,
  ]);

  const code = useMemo(
    () => getCode(selectedOp, collectionName, body, codeLang, resolvedKeyspace),
    [body, codeLang, collectionName, resolvedKeyspace, selectedOp]
  );

  const responseJson = useMemo(
    () => (response ? JSON.stringify(response.data, null, 2) : null),
    [response]
  );

  return {
    selectedOp,
    selectOp,
    body,
    updateBody,
    codeLang,
    setCodeLang,
    response,
    responseJson,
    running,
    bodyError,
    clientCalls,
    clientCallsLoading,
    refreshClientCalls: loadClientCalls,
    code,
    endpointPath: getEndpointPath(resolvedKeyspace, collectionName),
    endpointCopyText: `${resolvedConnection?.endpoint ?? ""}/api/json/v1/${resolvedKeyspace}/${collectionName}`,
    hasCollection: Boolean(collectionName),
    run,
  };
}
