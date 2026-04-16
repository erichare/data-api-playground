import { execFileSync } from "node:child_process";

export interface AstraCliProfileOption {
  name: string;
  isDefault: boolean;
}

export interface AstraCliDatabaseOption {
  id: string;
  name: string;
  endpoint: string;
  keyspace: string;
  region: string;
  status: string;
}

export interface AstraCliStatus {
  available: boolean;
  configured: boolean;
  profiles: AstraCliProfileOption[];
  selectedProfile: string | null;
  databases: AstraCliDatabaseOption[];
  error?: string;
}

interface AstraCliProfileRecord extends AstraCliProfileOption {
  token: string;
}

interface AstraCliConfigEntry {
  isUsedAsDefault?: boolean;
  name?: string;
  token?: string;
}

interface AstraCliDbEntry {
  id?: string;
  status?: string;
  dataEndpointUrl?: string;
  info?: {
    name?: string;
    keyspace?: string;
    region?: string;
  };
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const ASTRA_CLI_CACHE_TTL_MS = 30_000;
const ASTRA_CLI_TIMEOUT_MS = 5_000;
const ASTRA_CLI_MAX_BUFFER = 8 * 1024 * 1024;
const DEFAULT_ASTRA_KEYSPACE = "default_keyspace";

const profilesCache = new Map<string, CacheEntry<AstraCliProfileRecord[]>>();
const databasesCache = new Map<string, CacheEntry<AstraCliDatabaseOption[]>>();

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ASTRA_CLI_CACHE_TTL_MS,
  });
}

function normalizeCliEndpoint(rawEndpoint: string | undefined) {
  if (!rawEndpoint) {
    return "";
  }

  try {
    return new URL(rawEndpoint).origin;
  } catch {
    return rawEndpoint.replace(/\/$/, "");
  }
}

function toCliErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return "Astra CLI is not installed.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Astra CLI is not available.";
}

function readAstraCliJson<T>(args: string[]) {
  const stdout = execFileSync(
    "astra",
    [...args, "--no-input", "--no-spinner", "-o", "json"],
    {
      encoding: "utf8",
      timeout: ASTRA_CLI_TIMEOUT_MS,
      maxBuffer: ASTRA_CLI_MAX_BUFFER,
    }
  );

  const parsed = JSON.parse(stdout) as { data?: T };
  return parsed.data;
}

function loadAstraCliProfiles() {
  const cached = getCachedValue(profilesCache, "profiles");
  if (cached) {
    return cached;
  }

  const rawProfiles = readAstraCliJson<AstraCliConfigEntry[]>(["config", "list"]) ?? [];
  const dedupedProfiles = new Map<string, AstraCliProfileRecord>();

  for (const entry of rawProfiles) {
    const name = entry.name?.trim();
    if (!name) {
      continue;
    }

    const existing = dedupedProfiles.get(name);
    dedupedProfiles.set(name, {
      name,
      token: entry.token?.trim() ?? existing?.token ?? "",
      isDefault: Boolean(entry.isUsedAsDefault || existing?.isDefault),
    });
  }

  const profiles = [...dedupedProfiles.values()];
  setCachedValue(profilesCache, "profiles", profiles);
  return profiles;
}

function loadAstraCliDatabases(profile: string) {
  const cacheKey = `dbs:${profile}`;
  const cached = getCachedValue(databasesCache, cacheKey);
  if (cached) {
    return cached;
  }

  const rawDatabases =
    readAstraCliJson<AstraCliDbEntry[]>(["db", "list", "--profile", profile]) ?? [];

  const dedupedDatabases = new Map<string, AstraCliDatabaseOption>();

  for (const entry of rawDatabases) {
    const name = entry.info?.name?.trim();
    const id = entry.id?.trim();
    if (!name || !id) {
      continue;
    }

    dedupedDatabases.set(id, {
      id,
      name,
      endpoint: normalizeCliEndpoint(entry.dataEndpointUrl),
      keyspace: entry.info?.keyspace?.trim() || DEFAULT_ASTRA_KEYSPACE,
      region: entry.info?.region?.trim() || "",
      status: entry.status?.trim() || "",
    });
  }

  const databases = [...dedupedDatabases.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  setCachedValue(databasesCache, cacheKey, databases);
  return databases;
}

function pickSelectedProfile(
  profiles: AstraCliProfileRecord[],
  requestedProfile?: string
) {
  if (requestedProfile) {
    const explicit = profiles.find((profile) => profile.name === requestedProfile);
    if (explicit) {
      return explicit.name;
    }
  }

  return profiles.find((profile) => profile.isDefault)?.name ?? profiles[0]?.name ?? null;
}

export function clearAstraCliCache() {
  profilesCache.clear();
  databasesCache.clear();
}

export function getAstraCliStatus(requestedProfile?: string): AstraCliStatus {
  try {
    const profiles = loadAstraCliProfiles();
    const selectedProfile = pickSelectedProfile(profiles, requestedProfile);

    if (!selectedProfile) {
      return {
        available: true,
        configured: false,
        profiles: [],
        selectedProfile: null,
        databases: [],
        error: "Astra CLI is installed but no profiles are configured yet.",
      };
    }

    try {
      return {
        available: true,
        configured: true,
        profiles: profiles.map(({ name, isDefault }) => ({ name, isDefault })),
        selectedProfile,
        databases: loadAstraCliDatabases(selectedProfile),
      };
    } catch (error) {
      return {
        available: true,
        configured: true,
        profiles: profiles.map(({ name, isDefault }) => ({ name, isDefault })),
        selectedProfile,
        databases: [],
        error: toCliErrorMessage(error),
      };
    }
  } catch (error) {
    const message = toCliErrorMessage(error);
    return {
      available: message !== "Astra CLI is not installed.",
      configured: false,
      profiles: [],
      selectedProfile: null,
      databases: [],
      error: message,
    };
  }
}

export function resolveAstraCliConnection(input: {
  astraCliProfile?: string;
  astraCliDatabase?: string;
  keyspace?: string;
}) {
  const profiles = loadAstraCliProfiles();
  const selectedProfile = pickSelectedProfile(profiles, input.astraCliProfile);
  if (!selectedProfile) {
    throw new Error("Astra CLI is installed but no profiles are configured yet.");
  }

  const profile = profiles.find((entry) => entry.name === selectedProfile);
  if (!profile?.token) {
    throw new Error(`Astra CLI profile "${selectedProfile}" does not contain a token.`);
  }

  const databaseIdOrName = input.astraCliDatabase?.trim();
  if (!databaseIdOrName) {
    throw new Error("Select an Astra CLI database before connecting.");
  }

  const databases = loadAstraCliDatabases(selectedProfile);
  const database = databases.find(
    (entry) => entry.id === databaseIdOrName || entry.name === databaseIdOrName
  );

  if (!database?.endpoint) {
    throw new Error(
      `Astra CLI database "${databaseIdOrName}" could not be resolved for profile "${selectedProfile}".`
    );
  }

  return {
    token: profile.token,
    endpoint: database.endpoint,
    keyspace: input.keyspace || database.keyspace || DEFAULT_ASTRA_KEYSPACE,
    astraCliProfile: selectedProfile,
    astraCliDatabase: database.id,
  };
}
