"use client";

import type { BackendConnectionState } from "@/lib/backends/types";
import type { Collection } from "@/lib/types";
import {
  ApiOperationsPanel,
  ApiRequestPanel,
  ApiResponsePanel,
} from "./ApiExplorerPanels";
import { useApiExplorerSession } from "./hooks/useApiExplorerSession";

interface ApiExplorerProps {
  collection?: Collection;
  connection?: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace: string;
}

export function ApiExplorer({
  collection,
  connection,
  astraToken,
  astraEndpoint,
  keyspace,
}: ApiExplorerProps) {
  const {
    selectedOp,
    selectOp,
    body,
    updateBody,
    running,
    bodyError,
    codeLang,
    setCodeLang,
    code,
    endpointPath,
    endpointCopyText,
    hasCollection,
    run,
    response,
    responseJson,
    clientCalls,
    clientCallsLoading,
  } = useApiExplorerSession({
    collection,
    connection,
    astraToken,
    astraEndpoint,
    keyspace,
  });

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <ApiOperationsPanel selectedOp={selectedOp} onSelectOp={selectOp} />
      <ApiRequestPanel
        selectedOp={selectedOp}
        endpointPath={endpointPath}
        endpointCopyText={endpointCopyText}
        body={body}
        bodyError={bodyError}
        onBodyChange={updateBody}
        running={running}
        hasCollection={hasCollection}
        onRun={() => void run()}
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
