import type {
  AstraConnectionState,
  BackendConnectionInput,
  BackendConnectionState,
  BackendStatuses,
  HcdConnectionState,
} from "@/lib/backends/types";
import * as astra from "@/lib/astra";
import { resolveAstraCliConnection } from "@/lib/astraCli";
import { normalizeBackendKind, normalizeEndpoint } from "@/lib/backends/types";

export const ASTRA_DEFAULT_KEYSPACE = "default_keyspace";

function resolveAstraConnection(
  input: BackendConnectionInput,
  options?: { includeDefaultKeyspace?: boolean }
): AstraConnectionState {
  const astraCliRequested =
    input.backend !== "hcd" && Boolean("fromAstraCli" in input && input.fromAstraCli);
  const astraCliProfile =
    input.backend !== "hcd" && "astraCliProfile" in input
      ? input.astraCliProfile
      : undefined;
  const astraCliDatabase =
    input.backend !== "hcd" && "astraCliDatabase" in input
      ? input.astraCliDatabase
      : undefined;
  const legacyResolver = Object.prototype.hasOwnProperty.call(astra, "resolveAstraConnection")
    ? (astra as {
        resolveAstraConnection?: (
          input: { token?: string; endpoint?: string; keyspace?: string },
          options?: { includeDefaultKeyspace?: boolean }
        ) => { token: string; endpoint: string; keyspace?: string };
      }).resolveAstraConnection
    : undefined;
  const legacyResolved = legacyResolver
    ? astraCliRequested
      ? undefined
      : input.backend === "hcd"
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
  const cliResolved =
    input.backend === "hcd" || !astraCliRequested
      ? undefined
      : resolveAstraCliConnection({
          astraCliProfile,
          astraCliDatabase,
          keyspace: input.keyspace,
        });
  const resolved = legacyResolved ?? {
        token:
          cliResolved?.token ??
          (input.backend === "hcd"
            ? process.env.ASTRA_DB_APPLICATION_TOKEN || ""
            : input.token || process.env.ASTRA_DB_APPLICATION_TOKEN || ""),
        endpoint:
          cliResolved?.endpoint ??
          (input.backend === "hcd"
            ? normalizeEndpoint(process.env.ASTRA_DB_API_ENDPOINT)
            : normalizeEndpoint(input.endpoint || process.env.ASTRA_DB_API_ENDPOINT)),
        keyspace:
          cliResolved?.keyspace ||
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
    fromEnv:
      !astraCliRequested &&
      (input.backend === "hcd" || (!input.token && !input.endpoint)),
    ...(astraCliRequested ? { fromAstraCli: true } : {}),
    ...(cliResolved?.astraCliProfile ?? astraCliProfile
      ? { astraCliProfile: cliResolved?.astraCliProfile ?? astraCliProfile }
      : {}),
    ...(cliResolved?.astraCliDatabase ?? astraCliDatabase
      ? { astraCliDatabase: cliResolved?.astraCliDatabase ?? astraCliDatabase }
      : {}),
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
