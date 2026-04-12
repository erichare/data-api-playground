"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Collection } from "@/lib/types";

export interface ConnectionContextValue {
  astraToken: string;
  astraEndpoint: string;
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
