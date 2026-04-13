import { DataAPIClient } from "@datastax/astra-db-ts";

/** System/internal fields that should be excluded from user-visible field lists. */
export const SYSTEM_FIELDS = new Set([
  "_id", "$vector", "$vectorize", "$similarity", "$score", "$hybrid",
]);

/** Credentials provided by the client or read from environment variables. */
export interface AstraConnectionInput {
  token?: string;
  endpoint?: string;
  keyspace?: string;
}

/** Fully resolved Astra DB credentials ready for use. */
export interface ResolvedAstraConnection {
  token: string;
  endpoint: string;
  keyspace?: string;
}

export const DEFAULT_KEYSPACE = "default_keyspace";

/** Strip the trailing slash from an Astra DB endpoint URL. */
export function normalizeAstraEndpoint(endpoint: string) {
  return endpoint.replace(/\/$/, "");
}

const ALLOWED_ASTRA_HOST_SUFFIXES = [
  ".astra.datastax.com",
  ".apps.astra.datastax.com",
  ".astra-dev.datastax.com",
  ".apps.astra-dev.datastax.com",
];

/**
 * Validate that an endpoint URL belongs to a known Astra DB host.
 * Prevents SSRF by rejecting arbitrary URLs passed through the proxy.
 */
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

/**
 * Merge client-supplied Astra credentials with server environment variables.
 * Client values take precedence; env vars fill in any gaps.
 *
 * @param input - Credentials from the request body.
 * @param options - Pass `includeDefaultKeyspace: true` to fall back to "default_keyspace" when none is provided.
 * @returns Resolved token, endpoint, and optional keyspace.
 */
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
const CLIENT_CACHE_MAX_SIZE = 50;
const CLIENT_CACHE_CLEANUP_INTERVAL_MS = 60 * 1000;
const clientCache = new Map<string, { client: DataAPIClient; createdAt: number }>();

/** @internal Exposed for test cleanup only. */
export function clearClientCache() {
  clientCache.clear();
}

/** Evict expired entries from the client cache. */
function evictExpiredClients() {
  const now = Date.now();
  for (const [key, entry] of clientCache) {
    if (now - entry.createdAt >= CLIENT_CACHE_TTL_MS) {
      clientCache.delete(key);
    }
  }
}

// Proactively clean up expired clients on a timer (unref to avoid blocking shutdown).
if (typeof setInterval !== "undefined") {
  const timer = setInterval(evictExpiredClients, CLIENT_CACHE_CLEANUP_INTERVAL_MS);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}

function getOrCreateClient(token: string): DataAPIClient {
  const cached = clientCache.get(token);
  if (cached && Date.now() - cached.createdAt < CLIENT_CACHE_TTL_MS) {
    return cached.client;
  }

  // Evict oldest entries if the cache is at capacity.
  if (clientCache.size >= CLIENT_CACHE_MAX_SIZE) {
    evictExpiredClients();
    // If still at capacity after eviction, drop the oldest entry.
    if (clientCache.size >= CLIENT_CACHE_MAX_SIZE) {
      const oldestKey = clientCache.keys().next().value;
      if (oldestKey !== undefined) clientCache.delete(oldestKey);
    }
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
