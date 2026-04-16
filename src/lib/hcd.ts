import {
  DataAPIClient,
  UsernamePasswordTokenProvider,
} from "@datastax/astra-db-ts";

export interface HcdConnectionInput {
  endpoint?: string;
  username?: string;
  password?: string;
  keyspace?: string;
}

export interface ResolvedHcdConnection {
  endpoint: string;
  username: string;
  password: string;
  keyspace?: string;
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function normalizeHcdEndpoint(endpoint: string) {
  return endpoint.replace(/\/$/, "");
}

export function isAllowedHcdEndpoint(endpoint: string) {
  try {
    const url = new URL(normalizeHcdEndpoint(endpoint));
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

export function resolveHcdConnection(
  input: HcdConnectionInput
): ResolvedHcdConnection {
  return {
    endpoint: normalizeHcdEndpoint(
      input.endpoint || process.env.HCD_DATA_API_ENDPOINT || ""
    ),
    username: input.username || process.env.HCD_USERNAME || "",
    password: input.password || process.env.HCD_PASSWORD || "",
    keyspace: input.keyspace || process.env.HCD_KEYSPACE || undefined,
  };
}

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const CLIENT_CACHE_MAX_SIZE = 50;
const CLIENT_CACHE_CLEANUP_INTERVAL_MS = 60 * 1000;
const clientCache = new Map<string, { client: DataAPIClient; createdAt: number }>();

export function clearHcdClientCache() {
  clientCache.clear();
}

function evictExpiredClients() {
  const now = Date.now();
  for (const [key, entry] of clientCache) {
    if (now - entry.createdAt >= CLIENT_CACHE_TTL_MS) {
      clientCache.delete(key);
    }
  }
}

if (typeof setInterval !== "undefined") {
  const timer = setInterval(evictExpiredClients, CLIENT_CACHE_CLEANUP_INTERVAL_MS);
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}

function getOrCreateClient(username: string, password: string): DataAPIClient {
  const cacheKey = `${username}\0${password}`;
  const cached = clientCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CLIENT_CACHE_TTL_MS) {
    return cached.client;
  }

  if (clientCache.size >= CLIENT_CACHE_MAX_SIZE) {
    evictExpiredClients();
    if (clientCache.size >= CLIENT_CACHE_MAX_SIZE) {
      const oldestKey = clientCache.keys().next().value;
      if (oldestKey !== undefined) {
        clientCache.delete(oldestKey);
      }
    }
  }

  const client = new DataAPIClient(
    new UsernamePasswordTokenProvider(username, password),
    { environment: "hcd" }
  );
  clientCache.set(cacheKey, { client, createdAt: Date.now() });
  return client;
}

export function getHcdDb(
  username: string,
  password: string,
  endpoint: string,
  keyspace?: string
) {
  const normalizedEndpoint = normalizeHcdEndpoint(endpoint);
  if (!isAllowedHcdEndpoint(normalizedEndpoint)) {
    throw new Error(
      "Invalid HCD endpoint: use https for remote endpoints or http only for localhost"
    );
  }

  const client = getOrCreateClient(username, password);
  return keyspace
    ? client.db(normalizedEndpoint, { keyspace })
    : client.db(normalizedEndpoint);
}
