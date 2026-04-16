import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { DataApiBackendKind } from "@/lib/backends/types";
import type { KnowledgeBackendMode } from "@/lib/knowledge/types";

export const DEFAULT_PORTABLE_CONFIG_FILENAME = "data-api-playground.config.yaml";

export type AstraConfigMode = "credentials" | "astra-cli";

export interface PortableConfigDraftState {
  selectedBackend: DataApiBackendKind;
  astraConfigMode: AstraConfigMode;
  astraToken: string;
  astraEndpoint: string;
  astraCliProfile: string;
  astraCliDatabase: string;
  hcdEndpoint: string;
  hcdUsername: string;
  hcdPassword: string;
  knowledgeBackendMode: KnowledgeBackendMode;
  openragApiKey: string;
  openragBaseUrl: string;
  huggingfaceApiKey: string;
  hasOpenragEnvApiKey?: boolean;
  hasOpenragEnvBaseUrl?: boolean;
  hasHuggingFaceEnvKey?: boolean;
}

const astraBackendSchema = z.discriminatedUnion("source", [
  z.object({
    backend: z.literal("astra"),
    source: z.literal("credentials"),
    token: z.string().optional(),
    endpoint: z.string().optional(),
  }),
  z.object({
    backend: z.literal("astra"),
    source: z.literal("env"),
  }),
  z.object({
    backend: z.literal("astra"),
    source: z.literal("astra-cli"),
    profile: z.string().optional(),
    database: z.string().min(1),
  }),
]);

const hcdBackendSchema = z.discriminatedUnion("source", [
  z.object({
    backend: z.literal("hcd"),
    source: z.literal("credentials"),
    endpoint: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }),
  z.object({
    backend: z.literal("hcd"),
    source: z.literal("env"),
  }),
]);

const knowledgeBackendSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("connected"),
  }),
  z.object({
    mode: z.literal("openrag"),
    source: z.enum(["credentials", "env"]),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  }),
]);

const huggingFaceSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("manual"),
    apiKey: z.string().optional(),
  }),
  z.object({
    source: z.literal("env"),
  }),
  z.object({
    source: z.literal("none"),
  }),
]);

const portablePlaygroundConfigSchema = z.object({
  version: z.literal(1),
  dataBackend: z.union([astraBackendSchema, hcdBackendSchema]),
  knowledgeBackend: knowledgeBackendSchema,
  ai: z.object({
    huggingFace: huggingFaceSchema,
  }),
});

export type PortablePlaygroundConfig = z.infer<
  typeof portablePlaygroundConfigSchema
>;

function parsePortableConfigDocument(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Config file is empty.");
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as unknown;
  }

  return parseYaml(trimmed);
}

export function createPortablePlaygroundConfig(
  input: PortableConfigDraftState
): PortablePlaygroundConfig {
  const astraToken = input.astraToken.trim();
  const astraEndpoint = input.astraEndpoint.trim();
  const astraCliProfile = input.astraCliProfile.trim();
  const astraCliDatabase = input.astraCliDatabase.trim();
  const hcdEndpoint = input.hcdEndpoint.trim();
  const hcdUsername = input.hcdUsername.trim();
  const hcdPassword = input.hcdPassword.trim();
  const openragApiKey = input.openragApiKey.trim();
  const openragBaseUrl = input.openragBaseUrl.trim();
  const huggingfaceApiKey = input.huggingfaceApiKey.trim();

  const dataBackend =
    input.selectedBackend === "astra"
      ? input.astraConfigMode === "astra-cli" && astraCliDatabase
        ? {
            backend: "astra" as const,
            source: "astra-cli" as const,
            ...(astraCliProfile ? { profile: astraCliProfile } : {}),
            database: astraCliDatabase,
          }
        : astraToken || astraEndpoint
          ? {
              backend: "astra" as const,
              source: "credentials" as const,
              ...(astraToken ? { token: astraToken } : {}),
              ...(astraEndpoint ? { endpoint: astraEndpoint } : {}),
            }
          : {
              backend: "astra" as const,
              source: "env" as const,
            }
      : hcdEndpoint || hcdUsername || hcdPassword
        ? {
            backend: "hcd" as const,
            source: "credentials" as const,
            ...(hcdEndpoint ? { endpoint: hcdEndpoint } : {}),
            ...(hcdUsername ? { username: hcdUsername } : {}),
            ...(hcdPassword ? { password: hcdPassword } : {}),
          }
        : {
            backend: "hcd" as const,
            source: "env" as const,
          };

  const knowledgeBackend =
    input.knowledgeBackendMode === "openrag"
      ? openragApiKey || openragBaseUrl
        ? {
            mode: "openrag" as const,
            source: "credentials" as const,
            ...(openragApiKey ? { apiKey: openragApiKey } : {}),
            ...(openragBaseUrl ? { baseUrl: openragBaseUrl } : {}),
          }
        : {
            mode: "openrag" as const,
            source: "env" as const,
          }
      : {
          mode: "connected" as const,
        };

  const huggingFace =
    huggingfaceApiKey
      ? {
          source: "manual" as const,
          apiKey: huggingfaceApiKey,
        }
      : input.hasHuggingFaceEnvKey
        ? {
            source: "env" as const,
          }
        : {
            source: "none" as const,
          };

  return portablePlaygroundConfigSchema.parse({
    version: 1,
    dataBackend,
    knowledgeBackend,
    ai: {
      huggingFace,
    },
  });
}

export function stringifyPortablePlaygroundConfig(
  input: PortableConfigDraftState
) {
  return stringifyYaml(createPortablePlaygroundConfig(input), {
    indent: 2,
    sortMapEntries: false,
  });
}

export function parsePortablePlaygroundConfig(raw: string) {
  const parsed = portablePlaygroundConfigSchema.parse(
    parsePortableConfigDocument(raw)
  );

  return {
    selectedBackend: parsed.dataBackend.backend,
    astraConfigMode:
      parsed.dataBackend.backend === "astra" &&
      parsed.dataBackend.source === "astra-cli"
        ? ("astra-cli" as const)
        : ("credentials" as const),
    astraToken:
      parsed.dataBackend.backend === "astra" &&
      parsed.dataBackend.source === "credentials"
        ? (parsed.dataBackend.token ?? "")
        : "",
    astraEndpoint:
      parsed.dataBackend.backend === "astra" &&
      parsed.dataBackend.source === "credentials"
        ? (parsed.dataBackend.endpoint ?? "")
        : "",
    astraCliProfile:
      parsed.dataBackend.backend === "astra" &&
      parsed.dataBackend.source === "astra-cli"
        ? (parsed.dataBackend.profile ?? "")
        : "",
    astraCliDatabase:
      parsed.dataBackend.backend === "astra" &&
      parsed.dataBackend.source === "astra-cli"
        ? parsed.dataBackend.database
        : "",
    hcdEndpoint:
      parsed.dataBackend.backend === "hcd" &&
      parsed.dataBackend.source === "credentials"
        ? (parsed.dataBackend.endpoint ?? "")
        : "",
    hcdUsername:
      parsed.dataBackend.backend === "hcd" &&
      parsed.dataBackend.source === "credentials"
        ? (parsed.dataBackend.username ?? "")
        : "",
    hcdPassword:
      parsed.dataBackend.backend === "hcd" &&
      parsed.dataBackend.source === "credentials"
        ? (parsed.dataBackend.password ?? "")
        : "",
    knowledgeBackendMode: parsed.knowledgeBackend.mode,
    openragApiKey:
      parsed.knowledgeBackend.mode === "openrag" &&
      parsed.knowledgeBackend.source === "credentials"
        ? (parsed.knowledgeBackend.apiKey ?? "")
        : "",
    openragBaseUrl:
      parsed.knowledgeBackend.mode === "openrag" &&
      parsed.knowledgeBackend.source === "credentials"
        ? (parsed.knowledgeBackend.baseUrl ?? "")
        : "",
    huggingfaceApiKey:
      parsed.ai.huggingFace.source === "manual"
        ? (parsed.ai.huggingFace.apiKey ?? "")
        : "",
  };
}
