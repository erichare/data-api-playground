"use client";

import { AstraConnectDialog } from "@/components/connection/AstraConnectDialog";
import { NewCollectionDialog } from "@/components/collection/NewCollectionDialog";
import { QuickStartGuide } from "@/components/onboarding/QuickStartGuide";
import type { Collection } from "@/lib/types";

export interface PlaygroundDialogsProps {
  newCollectionOpen: boolean;
  onCloseNewCollection: () => void;
  onCollectionCreated: (collection: Collection) => void;
  astraToken: string;
  astraEndpoint: string;
  selectedKeyspace: string;
  quickStartOpen: boolean;
  onCloseQuickStart: () => void;
  connectDialogOpen: boolean;
  onCloseConnect: () => void;
  onConnect: (token: string, endpoint: string) => Promise<void>;
  onDisconnect: () => void;
  astraFromEnv: boolean;
  huggingfaceApiKey?: string;
  onHuggingfaceApiKeyChange: (value: string) => void;
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
  quickStartOpen,
  onCloseQuickStart,
  connectDialogOpen,
  onCloseConnect,
  onConnect,
  onDisconnect,
  astraFromEnv,
  huggingfaceApiKey,
  onHuggingfaceApiKeyChange,
  connectError,
  isConnected,
}: PlaygroundDialogsProps) {
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

      <QuickStartGuide open={quickStartOpen} onClose={onCloseQuickStart} />

      <AstraConnectDialog
        open={connectDialogOpen}
        onClose={onCloseConnect}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        connected={isConnected}
        currentToken={astraFromEnv ? "" : astraToken}
        currentEndpoint={astraFromEnv ? "" : astraEndpoint}
        currentHuggingfaceApiKey={huggingfaceApiKey}
        onHuggingfaceApiKeyChange={onHuggingfaceApiKeyChange}
        error={connectError}
      />
    </>
  );
}
