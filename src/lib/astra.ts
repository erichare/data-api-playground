import { DataAPIClient } from "@datastax/astra-db-ts";

/** System/internal fields that should be excluded from user-visible field lists. */
export const SYSTEM_FIELDS = new Set([
  "_id", "$vector", "$vectorize", "$similarity", "$score", "$hybrid",
]);

export interface AstraConnectionInput {
  token?: string;
  endpoint?: string;
  keyspace?: string;
}

export interface ResolvedAstraConnection {
  token: string;
  endpoint: string;
  keyspace?: string;
}

export const DEFAULT_KEYSPACE = "default_keyspace";

export function normalizeAstraEndpoint(endpoint: string) {
  return endpoint.replace(/\/$/, "");
}

const ALLOWED_ASTRA_HOST_SUFFIXES = [
  ".astra.datastax.com",
  ".apps.astra.datastax.com",
  ".astra-dev.datastax.com",
  ".apps.astra-dev.datastax.com",
];

export function isAllowedAstraEndpoint(endpoint: string) {
  try {
    const url = new URL(normalizeAstraEndpoint(endpoint));
    if (url.protocol !== "https:") return false;
    return ALLOWED_ASTRA_HOST_SUFFIXES.some(
      (suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix)
    );
  } catch {
    return false;
  }
}

export function resolveAstraConnection(
  input: AstraConnectionInput,
  options?: { includeDefaultKeyspace?: boolean }
): ResolvedAstraConnection {
  const token = input.token || process.env.ASTRA_DB_APPLICATION_TOKEN || "";
  const endpoint = normalizeAstraEndpoint(input.endpoint || process.env.ASTRA_DB_API_ENDPOINT || "");
  const keyspace = input.keyspace || (options?.includeDefaultKeyspace ? DEFAULT_KEYSPACE : undefined);

  return { token, endpoint, keyspace };
}

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const clientCache = new Map<string, { client: DataAPIClient; createdAt: number }>();

function getOrCreateClient(token: string): DataAPIClient {
  const cached = clientCache.get(token);
  if (cached && Date.now() - cached.createdAt < CLIENT_CACHE_TTL_MS) {
    return cached.client;
  }
  const client = new DataAPIClient(token);
  clientCache.set(token, { client, createdAt: Date.now() });
  return client;
}

/**
 * Create an Astra DB database handle from a token and endpoint.
 * Pass an optional keyspace to target a non-default namespace.
 * Clients are cached per token with a 5-minute TTL.
 */
export function getAstraDb(token: string, endpoint: string, keyspace?: string) {
  const normalizedEndpoint = normalizeAstraEndpoint(endpoint);
  if (!isAllowedAstraEndpoint(normalizedEndpoint)) {
    throw new Error("Invalid Astra DB endpoint");
  }
  const client = getOrCreateClient(token);
  return keyspace ? client.db(normalizedEndpoint, { keyspace }) : client.db(normalizedEndpoint);
}
