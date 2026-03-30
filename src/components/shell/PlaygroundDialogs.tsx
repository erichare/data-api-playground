"use client";

import { AstraConnectDialog } from "@/components/connection/AstraConnectDialog";
import { IngestDialog } from "@/components/collection/IngestDialog";
import { NewCollectionDialog } from "@/components/collection/NewCollectionDialog";
import { QuickStartGuide } from "@/components/onboarding/QuickStartGuide";
import type { Collection } from "@/lib/types";

interface PlaygroundDialogsProps {
  newCollectionOpen: boolean;
  onCloseNewCollection: () => void;
  onCollectionCreated: (collection: Collection) => void;
  astraToken: string;
  astraEndpoint: string;
  selectedKeyspace: string;
  ingestTarget: string | null;
  collections: Collection[];
  onCloseIngestDialog: () => void;
  quickStartOpen: boolean;
  onCloseQuickStart: () => void;
  connectDialogOpen: boolean;
  onCloseConnect: () => void;
  onConnect: (token: string, endpoint: string) => Promise<void>;
  onDisconnect: () => void;
  astraFromEnv: boolean;
  ibmApiKey: string;
  watsonxProjectId: string;
  onIbmApiKeyChange: (value: string) => void;
  onWatsonxProjectIdChange: (value: string) => void;
  connectError: string;
  isConnected: boolean;
}

export function PlaygroundDialogs({
  newCollectionOpen,
  onCloseNewCollection,
  onCollectionCreated,
  astraToken,
  astraEndpoint,
  selectedKeyspace,
  ingestTarget,
  collections,
  onCloseIngestDialog,
  quickStartOpen,
  onCloseQuickStart,
  connectDialogOpen,
  onCloseConnect,
  onConnect,
  onDisconnect,
  astraFromEnv,
  ibmApiKey,
  watsonxProjectId,
  onIbmApiKeyChange,
  onWatsonxProjectIdChange,
  connectError,
  isConnected,
}: PlaygroundDialogsProps) {
  const ingestCollection = ingestTarget
    ? collections.find((collection) => collection.name === ingestTarget) ?? null
    : null;

  return (
    <>
      <NewCollectionDialog
        open={newCollectionOpen}
        onClose={onCloseNewCollection}
        onCreated={onCollectionCreated}
        astraToken={astraToken}
        astraEndpoint={astraEndpoint}
        keyspace={selectedKeyspace}
        isConnected={isConnected}
      />

      {ingestCollection && (
        <IngestDialog
          collection={ingestCollection}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          isConnected={isConnected}
          onClose={onCloseIngestDialog}
        />
      )}

      <QuickStartGuide open={quickStartOpen} onClose={onCloseQuickStart} />

      <AstraConnectDialog
        open={connectDialogOpen}
        onClose={onCloseConnect}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        connected={isConnected}
        currentToken={astraFromEnv ? "" : astraToken}
        currentEndpoint={astraFromEnv ? "" : astraEndpoint}
        currentIbmApiKey={ibmApiKey}
        currentWatsonxProjectId={watsonxProjectId}
        onIbmApiKeyChange={onIbmApiKeyChange}
        onWatsonxProjectIdChange={onWatsonxProjectIdChange}
        error={connectError}
      />
    </>
  );
}
