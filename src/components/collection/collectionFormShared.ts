import type { Collection } from "@/lib/types";

export interface ProviderModel {
  provider: string;
  providerDisplayName: string;
  modelName: string;
  vectorDimension: number | null;
}

export const METRICS = ["cosine", "dot_product", "euclidean"] as const;

export type CollectionMode = "vectorize" | "client";
export type CollectionMetric = typeof METRICS[number];
export type CodeLang = "ts" | "python" | "java" | "curl";

interface CreateCollectionArgs {
  astraToken?: string;
  astraEndpoint?: string;
  keyspace?: string;
  isConnected?: boolean;
  name: string;
  mode: CollectionMode;
  dimension: number;
  metric: CollectionMetric;
  selectedModel: ProviderModel | null;
}

export async function fetchProviderModels(
  astraToken?: string,
  astraEndpoint?: string
): Promise<ProviderModel[]> {
  const response = await fetch("/api/embedding-providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: astraToken ?? "", endpoint: astraEndpoint ?? "" }),
  });
  const data = (await response.json()) as { models?: ProviderModel[]; error?: string };
  if (!response.ok || data.error) {
    throw new Error(data.error ?? "Failed to load providers");
  }
  return data.models ?? [];
}

export async function createCollection({
  astraToken,
  astraEndpoint,
  keyspace,
  isConnected = false,
  name,
  mode,
  dimension,
  metric,
  selectedModel,
}: CreateCollectionArgs): Promise<Collection> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Collection name is required");
  }

  if (!isConnected) {
    return {
      name: trimmedName,
      count: 0,
      vectorDim: mode === "vectorize" ? null : dimension,
      vectorizeService:
        mode === "vectorize"
          ? {
              provider: selectedModel?.provider ?? "nvidia",
              modelName: selectedModel?.modelName ?? "NV-Embed-QA",
            }
          : null,
    };
  }

  if (mode === "vectorize" && !selectedModel) {
    throw new Error("Select an embedding model");
  }

  const resolvedModel = selectedModel;

  const body =
    mode === "vectorize"
      ? {
          token: astraToken ?? "",
          endpoint: astraEndpoint ?? "",
          keyspace,
          name: trimmedName,
          provider: resolvedModel!.provider,
          model: resolvedModel!.modelName,
          dimension: resolvedModel!.vectorDimension ?? 1024,
          metric: "cosine",
        }
      : {
          token: astraToken ?? "",
          endpoint: astraEndpoint ?? "",
          keyspace,
          name: trimmedName,
          provider: "none",
          model: "",
          dimension,
          metric,
        };

  const response = await fetch("/api/create-collection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { collection?: Collection; error?: string };
  if (!response.ok || data.error || !data.collection) {
    throw new Error(data.error ?? "Failed to create collection");
  }

  return data.collection;
}
