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
  onCollectionStatsDelta?: (
    name: string,
    delta: { documentDelta: number; chunkDelta: number }
  ) => void;
}

export function PlaygroundMainPanel({
  viewMode,
  onViewModeChange,
  conversations,
  activeConversationId,
  messages,
  onMessagesUpdate,
  onCollectionStatsDelta,
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
          connection={conn.connection}
          keyspace={conn.keyspace}
        />
      ) : viewMode === "ingest" ? (
        <IngestTab
          connection={conn.connection}
          selectedBackend={conn.selectedBackend}
          knowledgeBackendMode={conn.knowledgeBackendMode}
          openragConnection={conn.openragConnection}
          knowledgeCapabilities={conn.knowledgeCapabilities}
          keyspace={conn.keyspace}
          collections={conn.collections}
          activeCollection={conn.activeCollection}
          huggingfaceApiKey={conn.huggingfaceApiKey}
          isConnected={conn.isConnected}
          onCollectionStatsDelta={onCollectionStatsDelta}
        />
      ) : (
        <ChatArea
          conversations={conversations}
          activeConversationId={activeConversationId}
          messages={messages}
          onMessagesUpdate={onMessagesUpdate}
          connection={conn.connection}
          selectedBackend={conn.selectedBackend}
          knowledgeBackendMode={conn.knowledgeBackendMode}
          openragConnection={conn.openragConnection}
          knowledgeCapabilities={conn.knowledgeCapabilities}
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
