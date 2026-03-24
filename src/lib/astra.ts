import { DataAPIClient } from "@datastax/astra-db-ts";

/** System/internal fields that should be excluded from user-visible field lists. */
export const SYSTEM_FIELDS = new Set([
  "_id", "$vector", "$vectorize", "$similarity", "$score", "$hybrid",
]);

/**
 * Create an Astra DB database handle from a token and endpoint.
 * Pass an optional keyspace to target a non-default namespace.
 */
export function getAstraDb(token: string, endpoint: string, keyspace?: string) {
  const client = new DataAPIClient(token);
  return keyspace ? client.db(endpoint, { keyspace }) : client.db(endpoint);
}
