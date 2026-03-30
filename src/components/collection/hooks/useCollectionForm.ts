"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Collection } from "@/lib/types";
import {
  createCollection,
  fetchProviderModels,
  type CollectionMetric,
  type CollectionMode,
  type ProviderModel,
} from "@/components/collection/collectionFormShared";

interface UseCollectionFormArgs {
  open: boolean;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace?: string;
  isConnected?: boolean;
  onCreated: (collection: Collection) => void;
  onClose: () => void;
}

export function useCollectionForm({
  open,
  astraToken,
  astraEndpoint,
  keyspace,
  isConnected = false,
  onCreated,
  onClose,
}: UseCollectionFormArgs) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<CollectionMode>("vectorize");
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providersError, setProvidersError] = useState("");
  const [dimension, setDimension] = useState(768);
  const [metric, setMetric] = useState<CollectionMetric>("cosine");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedModel = providerModels[selectedModelIdx] ?? null;
  const canSubmit =
    !!name.trim() &&
    !loading &&
    !(mode === "vectorize" && isConnected && !selectedModel);

  const loadProviderModels = useCallback(async () => {
    if (!isConnected) return;
    setLoadingProviders(true);
    setProvidersError("");
    try {
      const models = await fetchProviderModels(astraToken, astraEndpoint);
      setProviderModels(models);
      setSelectedModelIdx(0);
    } catch (err) {
      setProvidersError(
        err instanceof Error ? err.message : "Failed to load providers"
      );
    } finally {
      setLoadingProviders(false);
    }
  }, [astraEndpoint, astraToken, isConnected]);

  useEffect(() => {
    if (!open || !isConnected || mode !== "vectorize" || providerModels.length > 0) {
      return;
    }
    void loadProviderModels();
  }, [open, isConnected, mode, providerModels.length, loadProviderModels]);

  const resetAfterCreate = useCallback(() => {
    setName("");
    setError("");
  }, []);

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      const collection = await createCollection({
        astraToken,
        astraEndpoint,
        keyspace,
        isConnected,
        name,
        mode,
        dimension,
        metric,
        selectedModel,
      });
      onCreated(collection);
      resetAfterCreate();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create collection"
      );
    } finally {
      setLoading(false);
    }
  }, [
    astraEndpoint,
    astraToken,
    canSubmit,
    dimension,
    isConnected,
    keyspace,
    metric,
    mode,
    name,
    onClose,
    onCreated,
    resetAfterCreate,
    selectedModel,
  ]);

  return useMemo(
    () => ({
      name,
      setName,
      mode,
      setMode,
      providerModels,
      selectedModelIdx,
      setSelectedModelIdx,
      loadingProviders,
      providersError,
      dimension,
      setDimension,
      metric,
      setMetric,
      loading,
      error,
      isConnected,
      selectedModel,
      canSubmit,
      handleCreate,
    }),
    [
      canSubmit,
      dimension,
      error,
      handleCreate,
      isConnected,
      loading,
      loadingProviders,
      metric,
      mode,
      name,
      providerModels,
      providersError,
      selectedModel,
      selectedModelIdx,
    ]
  );
}
