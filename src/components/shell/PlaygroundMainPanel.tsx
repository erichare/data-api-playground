"use client";

import { ApiExplorer } from "@/components/api/ApiExplorer";
import { ChatArea } from "@/components/chat/ChatArea";
import { IngestTab } from "@/components/ingest/IngestTab";
import { ViewModeSwitcher } from "@/components/shell/ViewModeSwitcher";
import { useConnection } from "@/lib/context/ConnectionContext";
import type { Conversation, Message, ViewMode } from "@/lib/types";

export interface PlaygroundMainPanelProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  conversations: Conversation[];
  activeConversationId: string;
  messages: Message[];
  onMessagesUpdate: (messages: Message[]) => void;
}

export function PlaygroundMainPanel({
  viewMode,
  onViewModeChange,
  conversations,
  activeConversationId,
  messages,
  onMessagesUpdate,
}: PlaygroundMainPanelProps) {
  const conn = useConnection();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <ViewModeSwitcher
        viewMode={viewMode}
        activeCollection={conn.activeCollection}
        onChange={onViewModeChange}
      />

      {viewMode === "api" ? (
        <ApiExplorer
          collection={conn.activeCollectionObj}
          astraToken={conn.astraToken}
          astraEndpoint={conn.astraEndpoint}
          keyspace={conn.keyspace}
        />
      ) : viewMode === "ingest" ? (
        <IngestTab
          astraToken={conn.astraToken}
          astraEndpoint={conn.astraEndpoint}
          keyspace={conn.keyspace}
          collections={conn.collections}
          activeCollection={conn.activeCollection}
          huggingfaceApiKey={conn.huggingfaceApiKey}
          isConnected={conn.isConnected}
        />
      ) : (
        <ChatArea
          conversations={conversations}
          activeConversationId={activeConversationId}
          messages={messages}
          onMessagesUpdate={onMessagesUpdate}
          astraToken={conn.astraToken}
          astraEndpoint={conn.astraEndpoint}
          collections={conn.collections.map((collection) => ({
            name: collection.name,
            isVectorize: !!collection.vectorizeService,
            vectorDimension: collection.vectorDim,
          }))}
          activeCollection={conn.activeCollection}
          keyspace={conn.keyspace}
          huggingfaceApiKey={conn.huggingfaceApiKey}
          collectionFields={conn.collectionFields}
          isConnected={conn.isConnected}
          initializing={conn.initializing}
        />
      )}
    </div>
  );
}
