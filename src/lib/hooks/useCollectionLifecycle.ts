"use client";

import { useCallback, useRef } from "react";
import type { Collection } from "@/lib/types";
import { readApiErrorMessage } from "@/lib/playground/client";

interface UseCollectionLifecycleArgs {
  collections: Collection[];
  setCollections: React.Dispatch<React.SetStateAction<Collection[]>>;
  setCollectionFields: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setActiveCollection: (name: string) => void;
  astraToken: string;
  astraEndpoint: string;
  astraFromEnv: boolean;
  selectedKeyspace: string;
}

/**
 * Manages collection lifecycle operations: create, delete, and stats updates.
 *
 * Extracted from `usePlaygroundConnection` to keep connection/auth logic
 * separate from collection CRUD. Operates on the collections state passed
 * in from the parent hook via setters.
 */
export function useCollectionLifecycle({
  collections,
  setCollections,
  setCollectionFields,
  setActiveCollection,
  astraToken,
  astraEndpoint,
  astraFromEnv,
  selectedKeyspace,
}: UseCollectionLifecycleArgs) {
  const handleCollectionCreated = useCallback((collection: Collection) => {
    setCollections((prev) => {
      const nextCollection = {
        ...collection,
        documentCount: collection.documentCount ?? 0,
        creating: false,
        pendingKey: undefined,
      };
      const pendingIndex = prev.findIndex(
        (candidate) => candidate.name === collection.name && candidate.creating
      );
      if (pendingIndex >= 0) {
        const next = [...prev];
        next[pendingIndex] = nextCollection;
        return next;
      }
      return [...prev, nextCollection];
    });
    setActiveCollection(collection.name);
  }, [setCollections, setActiveCollection]);

  const handleCollectionCreateStarted = useCallback((collection: Collection) => {
    setCollections((prev) => [...prev, collection]);
  }, [setCollections]);

  const handleCollectionCreateFailed = useCallback(
    (name: string, message: string) => {
      setCollections(
        collections.filter(
          (collection) => !(collection.name === name && collection.creating)
        )
      );
      return message;
    },
    [collections, setCollections]
  );

  /**
   * Sample field names from a single document in a collection and update
   * `collectionFields` state. Called automatically when documents are added
   * to a collection so the chat system has up-to-date field metadata.
   */
  const refreshingFieldsRef = useRef<Set<string>>(new Set());
  const refreshCollectionFields = useCallback(
    (collectionName: string) => {
      // Avoid duplicate concurrent refreshes for the same collection
      if (refreshingFieldsRef.current.has(collectionName)) return;
      refreshingFieldsRef.current.add(collectionName);

      fetch("/api/sample-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: collectionName,
          token: astraFromEnv ? undefined : astraToken,
          endpoint: astraFromEnv ? undefined : astraEndpoint,
          keyspace: selectedKeyspace,
        }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as {
            collection: string;
            fields: string[];
          };
          if (data.fields && data.fields.length > 0) {
            setCollectionFields((prev) => ({
              ...prev,
              [data.collection]: data.fields,
            }));
          }
        })
        .catch(() => {
          // Field refresh is best-effort — don't disrupt the user.
        })
        .finally(() => {
          refreshingFieldsRef.current.delete(collectionName);
        });
    },
    [astraFromEnv, astraToken, astraEndpoint, selectedKeyspace, setCollectionFields]
  );

  const handleCollectionStatsDelta = useCallback(
    (
      name: string,
      {
        documentDelta,
        chunkDelta,
      }: { documentDelta: number; chunkDelta: number }
    ) => {
      setCollections((prev) =>
        prev.map((collection) => {
          if (collection.name !== name) {
            return collection;
          }

          const nextDocumentCount = Math.max(
            0,
            (collection.documentCount ?? 0) + documentDelta
          );

          return {
            ...collection,
            documentCount: nextDocumentCount,
            count:
              typeof collection.count === "number"
                ? Math.max(0, collection.count + chunkDelta)
                : collection.count,
          };
        })
      );

      // After documents are added, refresh field metadata for this collection
      // so the chat system knows the actual data shape.
      if (documentDelta > 0) {
        refreshCollectionFields(name);
      }
    },
    [setCollections, refreshCollectionFields]
  );

  const handleDeleteCollection = useCallback(
    async (name: string) => {
      const response = await fetch("/api/delete-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          token: astraFromEnv ? undefined : astraToken,
          endpoint: astraFromEnv ? undefined : astraEndpoint,
          keyspace: selectedKeyspace,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiErrorMessage(response, "Failed to delete collection")
        );
      }

      const nextCollections = collections.filter(
        (collection) => collection.name !== name
      );

      setCollections(nextCollections);
      setCollectionFields((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setActiveCollection(
        nextCollections.find((collection) => !collection.name.startsWith("dap_"))
          ?.name ??
        nextCollections[0]?.name ??
        ""
      );
    },
    [astraEndpoint, astraFromEnv, astraToken, collections, selectedKeyspace, setCollections, setCollectionFields, setActiveCollection]
  );

  return {
    handleCollectionCreated,
    handleCollectionCreateStarted,
    handleCollectionCreateFailed,
    handleCollectionStatsDelta,
    handleDeleteCollection,
  };
}
