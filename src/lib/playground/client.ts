"use client";
/* eslint-disable security/detect-unsafe-regex -- The untitled-conversation regex is static, simple, and never built from user input. */

import type {
  BackendCapabilities,
  BackendConnectionState,
} from "@/lib/backends/types";
import { buildConnectionRequestBody } from "@/lib/backends/types";
import type { Collection, Conversation, Message } from "@/lib/types";

export interface RemoteConversation {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface ApiErrorPayload {
  error?: string;
  requestId?: string;
}

export async function readApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    const message = payload.error ?? fallback;
    return payload.requestId ? `${message} (request ${payload.requestId})` : message;
  } catch {
    return fallback;
  }
}

export const UNTITLED_CONVERSATION_NAME = "Untitled";
const UNTITLED_CONVERSATION_PATTERN = /^Untitled(?: \((\d+)\))?$/;

export async function fetchCollectionsFromApi(
  connectionOrToken: BackendConnectionState | string | null,
  endpointOrKeyspace?: string,
  legacyKeyspace?: string
): Promise<{
  collections: Collection[];
  fields: Record<string, string[]>;
  keyspaces: string[];
  resolvedKeyspace?: string;
  capabilities: BackendCapabilities;
  keyspacesError?: string;
}> {
  const connection =
    typeof connectionOrToken === "string"
      ? {
          backend: "astra" as const,
          token: connectionOrToken,
          endpoint: endpointOrKeyspace ?? "",
        }
      : connectionOrToken;
  const keyspace =
    typeof connectionOrToken === "string" ? legacyKeyspace : endpointOrKeyspace;
  const connectRes = await fetch("/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildConnectionRequestBody(connection, { keyspace })),
  });

  const data = await connectRes.json() as {
    collections?: Collection[];
    fields?: Record<string, string[]>;
    keyspaces?: string[];
    resolvedKeyspace?: string;
    capabilities?: BackendCapabilities;
    error?: string;
    requestId?: string;
  };
  if (!connectRes.ok || data.error) {
    const message = data.error ?? "Connection failed";
    throw new Error(data.requestId ? `${message} (request ${data.requestId})` : message);
  }

  return {
    collections: data.collections ?? [],
    fields: data.fields ?? {},
    keyspaces: data.keyspaces ?? [],
    resolvedKeyspace: data.resolvedKeyspace,
    capabilities: data.capabilities ?? {
      connect: true,
      keyspaces: true,
      collectionCrud: true,
      embeddingProviders: true,
      vectorizeCollections: true,
      rawBrowse: true,
      deleteDocuments: true,
      apiProxy: true,
    },
    keyspacesError: data.error,
  };
}

export async function fetchConversationsFromApi(): Promise<Conversation[]> {
  const res = await fetch("/api/conversations");
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Failed to load conversations")
    );
  }
  const data = await res.json() as { conversations?: RemoteConversation[] };
  return (data.conversations ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    messages: [],
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    messageCount: c.messageCount,
  }));
}

export async function createConversationInApi(name?: string): Promise<Conversation> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to create conversation"));
  }
  const data = await res.json() as { conversation: RemoteConversation };
  const c = data.conversation;
  return {
    id: c.id,
    name: c.name,
    messages: [],
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    messageCount: 0,
  };
}

export function serializeMessage(msg: Message): Record<string, unknown> {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : String(msg.timestamp),
    ...(msg.searchMode ? { searchMode: msg.searchMode } : {}),
    ...(msg.latencyMs != null ? { latencyMs: msg.latencyMs } : {}),
    ...(msg.pipelineSteps ? {
      pipelineSteps: msg.pipelineSteps.map((s) => ({
        id: s.id,
        status: s.status,
        latencyMs: s.latencyMs,
        ...(s.id !== "search" ? { data: s.data } : {
          data: {
            collection: (s.data as Record<string, unknown>)?.collection,
            command: (s.data as Record<string, unknown>)?.command,
            resultCount: ((s.data as Record<string, unknown>)?.results as unknown[])?.length ?? 0,
          },
        }),
      })),
    } : {}),
    ...(msg.sources ? { sources: msg.sources } : {}),
  };
}

export function makeBlankConversation(): Conversation {
  const now = new Date();
  return {
    id: `conv-${Date.now()}`,
    name: UNTITLED_CONVERSATION_NAME,
    messages: [],
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
}

export function getNextUntitledConversationName(existing: Conversation[]) {
  const usedIndices = new Set<number>();
  for (const conversation of existing) {
    const match = conversation.name.match(UNTITLED_CONVERSATION_PATTERN);
    if (!match) continue;
    usedIndices.add(match[1] ? Number(match[1]) : 0);
  }

  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) nextIndex += 1;
  return nextIndex === 0 ? UNTITLED_CONVERSATION_NAME : `${UNTITLED_CONVERSATION_NAME} (${nextIndex})`;
}

export function isUntitledConversationName(name: string) {
  return UNTITLED_CONVERSATION_PATTERN.test(name);
}
