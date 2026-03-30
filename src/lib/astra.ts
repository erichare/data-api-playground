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

export function resolveAstraConnection(
  input: AstraConnectionInput,
  options?: { includeDefaultKeyspace?: boolean }
): ResolvedAstraConnection {
  const token = input.token || process.env.ASTRA_DB_APPLICATION_TOKEN || "";
  const endpoint = normalizeAstraEndpoint(input.endpoint || process.env.ASTRA_DB_API_ENDPOINT || "");
  const keyspace = input.keyspace || (options?.includeDefaultKeyspace ? DEFAULT_KEYSPACE : undefined);

  return { token, endpoint, keyspace };
}

/**
 * Create an Astra DB database handle from a token and endpoint.
 * Pass an optional keyspace to target a non-default namespace.
 */
export function getAstraDb(token: string, endpoint: string, keyspace?: string) {
  const client = new DataAPIClient(token);
  const normalizedEndpoint = normalizeAstraEndpoint(endpoint);
  return keyspace ? client.db(normalizedEndpoint, { keyspace }) : client.db(normalizedEndpoint);
}
