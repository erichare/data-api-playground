"use client";

import { AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import type { Collection } from "@/lib/types";
import { DocumentLibraryPanel } from "@/components/ingest/DocumentLibraryPanel";
import { DocumentViewer } from "@/components/ingest/DocumentViewer";
import { IngestUploadPanel } from "@/components/ingest/IngestUploadPanel";
import { RawCollectionBrowser } from "@/components/ingest/RawCollectionBrowser";
import { useDocumentLibrary } from "@/components/ingest/hooks/useDocumentLibrary";
import { useIngestUpload } from "@/components/ingest/hooks/useIngestUpload";

interface IngestTabProps {
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
  collections: Collection[];
  activeCollection?: string;
  huggingfaceApiKey?: string;
  isConnected: boolean;
  onCollectionStatsDelta?: (
    name: string,
    delta: { documentDelta: number; chunkDelta: number }
  ) => void;
}

export function IngestTab({
  astraToken,
  astraEndpoint,
  keyspace,
  collections,
  activeCollection,
  huggingfaceApiKey,
  isConnected,
  onCollectionStatsDelta,
}: IngestTabProps) {
  const selectedCollection = useMemo(
    () =>
      activeCollection ??
      collections[0]?.name ??
      "",
    [activeCollection, collections]
  );

  const {
    loadingDocs,
    loadError,
    search,
    setSearch,
    filterType,
    setFilterType,
    deletingId,
    viewingDoc,
    setViewingDoc,
    filteredDocs,
    loadDocuments,
    handleDelete,
    prependDocument,
    replaceDocumentsByIds,
  } = useDocumentLibrary({
    isConnected,
    selectedCollection,
    astraToken,
    astraEndpoint,
    keyspace,
    onCollectionStatsDelta,
  });

  const {
    isDragOver,
    setIsDragOver,
    queuedFiles,
    fileStatuses,
    uploading,
    addFiles,
    removeFile,
    handleIngest,
    resolveConflict,
  } = useIngestUpload({
    astraToken,
    astraEndpoint,
    keyspace,
    selectedCollection,
    huggingfaceApiKey,
    prependDocument,
    replaceDocumentsByIds,
  });

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <IngestUploadPanel
        isDragOver={isDragOver}
        setIsDragOver={setIsDragOver}
        queuedFiles={queuedFiles}
        fileStatuses={fileStatuses}
        selectedCollection={selectedCollection}
        uploading={uploading}
        onFilesAdded={addFiles}
        onRemoveFile={removeFile}
        onIngest={() => void handleIngest()}
        onResolveConflict={(file, action, applyToAll) =>
          void resolveConflict(file, action, applyToAll)
        }
      />

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <DocumentLibraryPanel
          filteredDocs={filteredDocs}
          loadingDocs={loadingDocs}
          loadError={loadError}
          search={search}
          setSearch={setSearch}
          filterType={filterType}
          setFilterType={setFilterType}
          loadDocuments={() => void loadDocuments()}
          deletingId={deletingId}
          onDelete={handleDelete}
          onView={setViewingDoc}
          isConnected={isConnected}
        />

        <RawCollectionBrowser
          isConnected={isConnected}
          selectedCollection={selectedCollection}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          keyspace={keyspace}
        />
      </div>

      <AnimatePresence>
        {viewingDoc && (
          <DocumentViewer
            doc={viewingDoc}
            astraToken={astraToken}
            astraEndpoint={astraEndpoint}
            keyspace={keyspace}
            isConnected={isConnected}
            onClose={() => setViewingDoc(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
