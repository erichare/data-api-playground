"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  BackendCapabilities,
  BackendConnectionState,
  DataApiBackendKind,
} from "@/lib/backends/types";
import type {
  KnowledgeBackendCapabilities,
  KnowledgeBackendMode,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";
import type { Collection } from "@/lib/types";

export interface ConnectionContextValue {
  connection: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  astraFromEnv?: boolean;
  selectedBackend: DataApiBackendKind;
  knowledgeBackendMode: KnowledgeBackendMode;
  knowledgeBackendKind: DataApiBackendKind | "openrag";
  knowledgeCapabilities: KnowledgeBackendCapabilities;
  openragConnection: OpenragKnowledgeState | null;
  capabilities: BackendCapabilities;
  keyspace: string;
  isConnected: boolean;
  initializing: boolean;
  collections: Collection[];
  activeCollection: string;
  activeCollectionObj?: Collection;
  collectionFields: Record<string, string[]>;
  huggingfaceApiKey: string;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({
  value,
  children,
}: {
  value: ConnectionContextValue;
  children: ReactNode;
}) {
  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return ctx;
}
