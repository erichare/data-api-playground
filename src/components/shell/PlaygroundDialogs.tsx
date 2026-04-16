"use client";

import { ConnectionDialog } from "@/components/connection/ConnectionDialog";
import { NewCollectionDialog } from "@/components/collection/NewCollectionDialog";
import { QuickStartGuide } from "@/components/onboarding/QuickStartGuide";
import type {
  BackendCapabilities,
  BackendConnectionState,
  BackendStatuses,
  DataApiBackendKind,
} from "@/lib/backends/types";
import type {
  KnowledgeBackendMode,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";
import type { Collection } from "@/lib/types";

export interface PlaygroundDialogsProps {
  newCollectionOpen: boolean;
  onCloseNewCollection: () => void;
  onCollectionCreateStarted?: (collection: Collection) => void;
  onCollectionCreateFailed?: (name: string, message: string) => void;
  onCollectionCreated: (collection: Collection) => void;
  connection?: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  astraFromEnv?: boolean;
  selectedBackend?: DataApiBackendKind;
  knowledgeBackendMode?: KnowledgeBackendMode;
  openragConnection?: OpenragKnowledgeState | null;
  onSelectedBackendChange?: (backend: DataApiBackendKind) => void;
  onKnowledgeBackendModeChange?: (mode: KnowledgeBackendMode) => void;
  onOpenragConnectionChange?: (connection: OpenragKnowledgeState | null) => void;
  backendStatuses?: BackendStatuses | null;
  capabilities?: BackendCapabilities;
  selectedKeyspace: string;
  quickStartOpen: boolean;
  onCloseQuickStart: () => void;
  connectDialogOpen: boolean;
  onCloseConnect: () => void;
  onConnect: (connection: BackendConnectionState) => Promise<void>;
  onDisconnect: () => void;
  huggingfaceApiKey?: string;
  onHuggingfaceApiKeyChange: (value: string) => void;
  connectError: string;
  isConnected: boolean;
}

export function PlaygroundDialogs({
  newCollectionOpen,
  onCloseNewCollection,
  onCollectionCreateStarted,
  onCollectionCreateFailed,
  onCollectionCreated,
  connection,
  astraToken,
  astraEndpoint,
  astraFromEnv = false,
  selectedBackend = "astra",
  knowledgeBackendMode = "connected",
  openragConnection = null,
  onSelectedBackendChange = () => undefined,
  onKnowledgeBackendModeChange = () => undefined,
  onOpenragConnectionChange = () => undefined,
  backendStatuses = null,
  capabilities = {
    connect: true,
    keyspaces: true,
    collectionCrud: true,
    embeddingProviders: true,
    vectorizeCollections: true,
    rawBrowse: true,
    deleteDocuments: true,
    apiProxy: true,
  },
  selectedKeyspace,
  quickStartOpen,
  onCloseQuickStart,
  connectDialogOpen,
  onCloseConnect,
  onConnect,
  onDisconnect,
  huggingfaceApiKey,
  onHuggingfaceApiKeyChange,
  connectError,
  isConnected,
}: PlaygroundDialogsProps) {
  const resolvedConnection =
    connection ??
    (astraToken || astraEndpoint || astraFromEnv
      ? {
          backend: "astra" as const,
          token: astraToken ?? "",
          endpoint: astraEndpoint ?? "",
          fromEnv: astraFromEnv,
        }
      : null);

  return (
    <>
      <NewCollectionDialog
        open={newCollectionOpen}
        onClose={onCloseNewCollection}
        onCreateStarted={onCollectionCreateStarted}
        onCreateFailed={onCollectionCreateFailed}
        onCreated={onCollectionCreated}
        connection={resolvedConnection}
        astraToken={resolvedConnection?.backend === "astra" ? resolvedConnection.token : ""}
        astraEndpoint={resolvedConnection?.backend === "astra" ? resolvedConnection.endpoint : ""}
        capabilities={capabilities}
        keyspace={selectedKeyspace}
        isConnected={isConnected}
      />

      <QuickStartGuide open={quickStartOpen} onClose={onCloseQuickStart} />

      <ConnectionDialog
        open={connectDialogOpen}
        onClose={onCloseConnect}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        connected={isConnected}
        selectedBackend={selectedBackend}
        onSelectedBackendChange={onSelectedBackendChange}
        knowledgeBackendMode={knowledgeBackendMode}
        onKnowledgeBackendModeChange={onKnowledgeBackendModeChange}
        currentOpenragConnection={openragConnection}
        onOpenragConnectionChange={onOpenragConnectionChange}
        currentConnection={resolvedConnection}
        backendStatuses={backendStatuses}
        currentHuggingfaceApiKey={huggingfaceApiKey}
        onHuggingfaceApiKeyChange={onHuggingfaceApiKeyChange}
        error={connectError}
      />
    </>
  );
}
