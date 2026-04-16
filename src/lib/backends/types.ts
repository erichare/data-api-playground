export type DataApiBackendKind = "astra" | "hcd";
export type KnowledgeBackendKind = DataApiBackendKind | "openrag";

export interface AstraConnectionInput {
  backend?: "astra";
  token?: string;
  endpoint?: string;
  keyspace?: string;
  fromAstraCli?: boolean;
  astraCliProfile?: string;
  astraCliDatabase?: string;
}

export interface HcdConnectionInput {
  backend: "hcd";
  endpoint?: string;
  username?: string;
  password?: string;
  keyspace?: string;
}

export type BackendConnectionInput = AstraConnectionInput | HcdConnectionInput;

export interface AstraConnectionState {
  backend: "astra";
  token: string;
  endpoint: string;
  keyspace?: string;
  fromEnv?: boolean;
  fromAstraCli?: boolean;
  astraCliProfile?: string;
  astraCliDatabase?: string;
}

export interface HcdConnectionState {
  backend: "hcd";
  endpoint: string;
  username: string;
  password: string;
  keyspace?: string;
  fromEnv?: boolean;
}

export type BackendConnectionState = AstraConnectionState | HcdConnectionState;

export interface BackendCapabilities {
  connect: boolean;
  keyspaces: boolean;
  collectionCrud: boolean;
  embeddingProviders: boolean;
  vectorizeCollections: boolean;
  rawBrowse: boolean;
  deleteDocuments: boolean;
  apiProxy: boolean;
}

export interface BackendStatus {
  kind: DataApiBackendKind;
  ready: boolean;
  hasEndpoint: boolean;
  hasToken?: boolean;
  hasUsername?: boolean;
  hasPassword?: boolean;
}

export interface BackendStatuses {
  astra: BackendStatus;
  hcd: BackendStatus;
  defaultBackend: DataApiBackendKind | null;
}

export function normalizeBackendKind(
  value: string | null | undefined
): DataApiBackendKind {
  return value === "hcd" ? "hcd" : "astra";
}

export function normalizeEndpoint(endpoint: string | undefined) {
  return (endpoint ?? "").replace(/\/$/, "");
}

export function buildConnectionRequestBody(
  connection: BackendConnectionState | null | undefined,
  overrides?: { keyspace?: string }
): Record<string, unknown> {
  if (!connection) {
    return {
      ...(overrides?.keyspace ? { keyspace: overrides.keyspace } : {}),
    };
  }

  if (connection.backend === "astra") {
    if (connection.fromAstraCli) {
      return {
        fromAstraCli: true,
        ...(connection.astraCliProfile ? { astraCliProfile: connection.astraCliProfile } : {}),
        ...(connection.astraCliDatabase
          ? { astraCliDatabase: connection.astraCliDatabase }
          : {}),
        ...(overrides?.keyspace ?? connection.keyspace
          ? { keyspace: overrides?.keyspace ?? connection.keyspace }
          : {}),
      };
    }

    return {
      ...(connection.fromEnv ? {} : { token: connection.token, endpoint: connection.endpoint }),
      ...(overrides?.keyspace ?? connection.keyspace
        ? { keyspace: overrides?.keyspace ?? connection.keyspace }
        : {}),
    };
  }

  return {
    backend: "hcd",
    ...(connection.fromEnv
      ? {}
      : {
          endpoint: connection.endpoint,
          username: connection.username,
          password: connection.password,
        }),
    ...(overrides?.keyspace ?? connection.keyspace
      ? { keyspace: overrides?.keyspace ?? connection.keyspace }
      : {}),
  };
}

export function hasConnectionCredentials(
  connection: BackendConnectionState | null | undefined
) {
  if (!connection) {
    return false;
  }

  if (connection.fromEnv) {
    return true;
  }

  if (connection.backend === "astra" && connection.fromAstraCli) {
    return Boolean(connection.astraCliDatabase);
  }

  return connection.backend === "astra"
    ? Boolean(connection.token && connection.endpoint)
    : Boolean(connection.endpoint && connection.username && connection.password);
}

export function appendConnectionFormData(
  formData: FormData,
  connection: BackendConnectionState | null | undefined,
  overrides?: { keyspace?: string }
) {
  const payload = buildConnectionRequestBody(connection, overrides);
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) {
      continue;
    }
    formData.append(key, String(value));
  }
}

export function getBackendDisplayName(kind: DataApiBackendKind) {
  return kind === "hcd" ? "DataStax HCD" : "Data API";
}

export function getBackendConnectionLabel(kind: DataApiBackendKind) {
  return kind === "hcd" ? "HCD" : "Data API";
}
