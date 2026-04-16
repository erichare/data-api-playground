import type {
  AstraConnectionState,
  BackendConnectionInput,
  BackendConnectionState,
  BackendStatuses,
  HcdConnectionState,
} from "@/lib/backends/types";
import * as astra from "@/lib/astra";
import { normalizeBackendKind, normalizeEndpoint } from "@/lib/backends/types";

export const ASTRA_DEFAULT_KEYSPACE = "default_keyspace";

function resolveAstraConnection(
  input: BackendConnectionInput,
  options?: { includeDefaultKeyspace?: boolean }
): AstraConnectionState {
  const legacyResolver = Object.prototype.hasOwnProperty.call(astra, "resolveAstraConnection")
    ? (astra as {
        resolveAstraConnection?: (
          input: { token?: string; endpoint?: string; keyspace?: string },
          options?: { includeDefaultKeyspace?: boolean }
        ) => { token: string; endpoint: string; keyspace?: string };
      }).resolveAstraConnection
    : undefined;
  const legacyResolved = legacyResolver
    ? input.backend === "hcd"
      ? legacyResolver({}, options)
      : legacyResolver(
          {
            token: input.token,
            endpoint: input.endpoint,
            keyspace: input.keyspace,
          },
          options
        )
    : undefined;
  const resolved = legacyResolved ?? {
        token:
          input.backend === "hcd"
            ? process.env.ASTRA_DB_APPLICATION_TOKEN || ""
            : input.token || process.env.ASTRA_DB_APPLICATION_TOKEN || "",
        endpoint:
          input.backend === "hcd"
            ? normalizeEndpoint(process.env.ASTRA_DB_API_ENDPOINT)
            : normalizeEndpoint(input.endpoint || process.env.ASTRA_DB_API_ENDPOINT),
        keyspace:
          input.keyspace ||
          process.env.ASTRA_DB_KEYSPACE ||
          (options?.includeDefaultKeyspace ? ASTRA_DEFAULT_KEYSPACE : undefined),
      };
  const keyspace =
    resolved.keyspace ||
    process.env.ASTRA_DB_KEYSPACE ||
    (options?.includeDefaultKeyspace ? ASTRA_DEFAULT_KEYSPACE : undefined);

  return {
    backend: "astra",
    token: resolved.token,
    endpoint: normalizeEndpoint(resolved.endpoint),
    keyspace,
    fromEnv: input.backend === "hcd" || (!input.token && !input.endpoint),
  };
}

function resolveHcdConnection(
  input: BackendConnectionInput,
  options?: { includeDefaultKeyspace?: boolean }
): HcdConnectionState {
  const endpoint =
    input.backend === "hcd"
      ? normalizeEndpoint(input.endpoint || process.env.HCD_DATA_API_ENDPOINT)
      : normalizeEndpoint(process.env.HCD_DATA_API_ENDPOINT);
  const username =
    input.backend === "hcd"
      ? input.username || process.env.HCD_USERNAME || ""
      : process.env.HCD_USERNAME || "";
  const password =
    input.backend === "hcd"
      ? input.password || process.env.HCD_PASSWORD || ""
      : process.env.HCD_PASSWORD || "";
  const keyspace =
    input.keyspace ||
    process.env.HCD_KEYSPACE ||
    (options?.includeDefaultKeyspace ? undefined : undefined);

  return {
    backend: "hcd",
    endpoint,
    username,
    password,
    keyspace,
    fromEnv: input.backend !== "hcd" || (!input.endpoint && !input.username && !input.password),
  };
}

export function resolveBackendConnection(
  input: BackendConnectionInput,
  options?: { includeDefaultKeyspace?: boolean }
): BackendConnectionState {
  const kind = normalizeBackendKind(input.backend);
  return kind === "hcd"
    ? resolveHcdConnection(input, options)
    : resolveAstraConnection(input, options);
}

export function getBackendStatuses(): BackendStatuses {
  const astra = {
    kind: "astra" as const,
    ready:
      !!process.env.ASTRA_DB_APPLICATION_TOKEN &&
      !!process.env.ASTRA_DB_API_ENDPOINT,
    hasEndpoint: !!process.env.ASTRA_DB_API_ENDPOINT,
    hasToken: !!process.env.ASTRA_DB_APPLICATION_TOKEN,
  };
  const hcd = {
    kind: "hcd" as const,
    ready:
      !!process.env.HCD_DATA_API_ENDPOINT &&
      !!process.env.HCD_USERNAME &&
      !!process.env.HCD_PASSWORD,
    hasEndpoint: !!process.env.HCD_DATA_API_ENDPOINT,
    hasUsername: !!process.env.HCD_USERNAME,
    hasPassword: !!process.env.HCD_PASSWORD,
  };

  return {
    astra,
    hcd,
    defaultBackend: astra.ready ? "astra" : hcd.ready ? "hcd" : null,
  };
}
