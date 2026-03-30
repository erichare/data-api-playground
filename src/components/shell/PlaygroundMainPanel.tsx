"use client";

import { ApiExplorer } from "@/components/api/ApiExplorer";
import { ChatArea } from "@/components/chat/ChatArea";
import { IngestTab } from "@/components/ingest/IngestTab";
import { ViewModeSwitcher } from "@/components/shell/ViewModeSwitcher";
import type { Collection, Conversation, Message, ViewMode } from "@/lib/types";

interface PlaygroundMainPanelProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeCollection: string;
  activeCollectionObj?: Collection;
  collections: Collection[];
  collectionFields: Record<string, string[]>;
  conversations: Conversation[];
  activeConversationId: string;
  messages: Message[];
  onMessagesUpdate: (messages: Message[]) => void;
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
  ibmApiKey: string;
  watsonxProjectId: string;
  initializing: boolean;
  isConnected: boolean;
}

export function PlaygroundMainPanel({
  viewMode,
  onViewModeChange,
  activeCollection,
  activeCollectionObj,
  collections,
  collectionFields,
  conversations,
  activeConversationId,
  messages,
  onMessagesUpdate,
  astraToken,
  astraEndpoint,
  keyspace,
  ibmApiKey,
  watsonxProjectId,
  initializing,
  isConnected,
}: PlaygroundMainPanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <ViewModeSwitcher
        viewMode={viewMode}
        activeCollection={activeCollection}
        onChange={onViewModeChange}
      />

      {viewMode === "api" ? (
        <ApiExplorer
          collection={activeCollectionObj}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          keyspace={keyspace}
        />
      ) : viewMode === "ingest" ? (
        <IngestTab
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          keyspace={keyspace}
          collections={collections}
          activeCollection={activeCollection}
          isConnected={isConnected}
        />
      ) : (
        <ChatArea
          conversations={conversations}
          activeConversationId={activeConversationId}
          messages={messages}
          onMessagesUpdate={onMessagesUpdate}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          collections={collections.map((collection) => ({
            name: collection.name,
            isVectorize: !!collection.vectorizeService,
          }))}
          activeCollection={activeCollection}
          keyspace={keyspace}
          ibmApiKey={ibmApiKey}
          watsonxProjectId={watsonxProjectId}
          collectionFields={collectionFields}
          initializing={initializing}
        />
      )}
    </div>
  );
}
