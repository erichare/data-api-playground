// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_DOCUMENT_UPLOAD_MB,
} from "@/lib/ingest/constants";
import { useIngestUpload } from "./useIngestUpload";

// Mock ingestShared utilities
vi.mock("@/components/ingest/ingestShared", () => ({
  fileKey: (f: File) => `${f.name}__${f.size}`,
  getFileType: (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() ?? "txt";
    return ["pdf", "txt", "md", "csv", "json", "docx", "xlsx"].includes(ext)
      ? ext
      : "txt";
  },
}));

function makeFile(name: string, size = 1024): File {
  return new File(["x".repeat(size)], name, { type: "application/octet-stream" });
}

const defaultArgs = {
  astraToken: "test-token",
  astraEndpoint: "https://test.endpoint.com",
  keyspace: "test-ks",
  selectedCollection: "my-col",
  huggingfaceApiKey: "",
  prependDocument: vi.fn(),
  replaceDocumentsByIds: vi.fn(),
};

describe("useIngestUpload", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    defaultArgs.prependDocument = vi.fn();
    defaultArgs.replaceDocumentsByIds = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("initializes with correct defaults", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      expect(result.current.isDragOver).toBe(false);
      expect(result.current.queuedFiles).toEqual([]);
      expect(result.current.fileStatuses.size).toBe(0);
      expect(result.current.uploading).toBe(false);
    });
  });

  describe("setIsDragOver", () => {
    it("updates isDragOver state", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.setIsDragOver(true);
      });

      expect(result.current.isDragOver).toBe(true);

      act(() => {
        result.current.setIsDragOver(false);
      });

      expect(result.current.isDragOver).toBe(false);
    });
  });

  describe("addFiles", () => {
    it("adds new files to the queue with queued status", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      const file1 = makeFile("doc1.pdf");
      const file2 = makeFile("doc2.txt");

      act(() => {
        result.current.addFiles([file1, file2]);
      });

      expect(result.current.queuedFiles).toHaveLength(2);
      expect(result.current.fileStatuses.get("doc1.pdf__1024")).toEqual({ stage: "queued" });
      expect(result.current.fileStatuses.get("doc2.txt__1024")).toEqual({ stage: "queued" });
    });

    it("deduplicates files with same name and size", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      const file = makeFile("doc.pdf");

      act(() => {
        result.current.addFiles([file]);
      });
      act(() => {
        result.current.addFiles([file]);
      });

      expect(result.current.queuedFiles).toHaveLength(1);
    });

    it("does not overwrite existing status when re-adding same file", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      const file = makeFile("doc.pdf");

      act(() => {
        result.current.addFiles([file]);
      });

      // Manually verify status remains queued (not reset) after second add attempt
      const statusBefore = result.current.fileStatuses.get("doc.pdf__1024");

      act(() => {
        result.current.addFiles([file]);
      });

      expect(result.current.fileStatuses.get("doc.pdf__1024")).toEqual(statusBefore);
    });

    it("can add multiple batches of distinct files", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([makeFile("a.pdf")]);
      });
      act(() => {
        result.current.addFiles([makeFile("b.txt", 2048)]);
      });

      expect(result.current.queuedFiles).toHaveLength(2);
    });
  });

  describe("removeFile", () => {
    it("removes a file from the queue and clears its status", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      const file = makeFile("doc.pdf");

      act(() => {
        result.current.addFiles([file]);
      });

      act(() => {
        result.current.removeFile(file);
      });

      expect(result.current.queuedFiles).toHaveLength(0);
      expect(result.current.fileStatuses.has("doc.pdf__1024")).toBe(false);
    });

    it("only removes the targeted file, leaving others intact", () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      const file1 = makeFile("a.pdf");
      const file2 = makeFile("b.pdf", 2048);

      act(() => {
        result.current.addFiles([file1, file2]);
      });

      act(() => {
        result.current.removeFile(file1);
      });

      expect(result.current.queuedFiles).toHaveLength(1);
      expect(result.current.queuedFiles[0].name).toBe("b.pdf");
    });
  });

  describe("handleIngest", () => {
    it("does nothing when queue is empty", async () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(result.current.uploading).toBe(false);
    });

    it("does nothing when already uploading", async () => {
      const file = makeFile("doc.pdf");
      let resolveStream!: () => void;
      const neverEndingStream = new ReadableStream({
        start(controller) {
          resolveStream = () => controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: neverEndingStream,
      } as unknown as Response);

      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      // Start first upload (don't await)
      act(() => {
        void result.current.handleIngest();
      });

      expect(result.current.uploading).toBe(true);

      // Second call should be a no-op
      await act(async () => {
        await result.current.handleIngest();
      });

      // fetch should only have been called once
      expect(fetch).toHaveBeenCalledTimes(1);

      resolveStream();
    });

    it("skips files with stage=done", async () => {
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      const file = makeFile("done.pdf");

      act(() => {
        result.current.addFiles([file]);
      });

      // Manually force status to done by processing once
      const encoder = new TextEncoder();
      const doneEvent = JSON.stringify({
        type: "complete",
        chunks: 2,
        source_doc_id: "doc-done",
      });
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(doneEvent + "\n"));
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("done.pdf__1024")).toEqual({
        stage: "done",
        chunks: 2,
      });

      // Now call handleIngest again — file with stage=done should be skipped
      await act(async () => {
        await result.current.handleIngest();
      });

      // fetch should only have been called once (for the first ingest)
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("processes chunked and chunk_progress stream events", async () => {
      const file = makeFile("report.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const events = [
        JSON.stringify({ type: "chunked", chunks: 5 }),
        JSON.stringify({ type: "chunk_progress", processed: 2, total: 5 }),
        JSON.stringify({ type: "complete", chunks: 5, source_doc_id: "doc-xyz" }),
      ].join("\n") + "\n";

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(events));
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("report.pdf__1024")).toEqual({
        stage: "done",
        chunks: 5,
      });
      expect(defaultArgs.prependDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          source_doc_id: "doc-xyz",
          source_filename: "report.pdf",
          collection: "my-col",
          chunk_total: 5,
        })
      );
      expect(defaultArgs.replaceDocumentsByIds).not.toHaveBeenCalled();
    });

    it("replaces existing document rows when the server reports an overwrite", async () => {
      const file = makeFile("report.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const events = [
        JSON.stringify({ type: "chunked", chunks: 2 }),
        JSON.stringify({
          type: "complete",
          chunks: 2,
          source_doc_id: "doc-new",
          replaced_source_doc_ids: ["doc-old-1", "doc-old-2"],
          md5_hash: "new-hash",
        }),
      ].join("\n") + "\n";

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(events));
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(defaultArgs.replaceDocumentsByIds).toHaveBeenCalledWith(
        expect.objectContaining({
          source_doc_id: "doc-new",
          md5_hash: "new-hash",
          source_filename: "report.pdf",
        }),
        ["doc-old-1", "doc-old-2"]
      );
      expect(defaultArgs.prependDocument).not.toHaveBeenCalled();
    });

    it("sets error status when stream contains an error event", async () => {
      const file = makeFile("bad.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const errorEvent = JSON.stringify({ type: "error", message: "Parse failed" }) + "\n";

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("bad.pdf__1024")).toEqual({
        stage: "error",
        message: "Parse failed",
      });
    });

    it("sets error status when response has no body", async () => {
      const file = makeFile("empty.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: null,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("empty.pdf__1024")).toEqual({
        stage: "error",
        message: "No response stream",
      });
    });

    it("sets error status when fetch throws", async () => {
      const file = makeFile("network.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("network.pdf__1024")).toEqual({
        stage: "error",
        message: "Network error",
      });
    });

    it("rejects oversized files before issuing the upload request", async () => {
      const file = makeFile("large.pdf", MAX_DOCUMENT_UPLOAD_BYTES + 1);
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(
        result.current.fileStatuses.get(`large.pdf__${MAX_DOCUMENT_UPLOAD_BYTES + 1}`)
      ).toEqual({
        stage: "error",
        message: `File exceeds ${MAX_DOCUMENT_UPLOAD_MB} MB upload limit`,
      });
    });

    it("sets generic error message for non-Error throws", async () => {
      const file = makeFile("strange.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      vi.mocked(fetch).mockRejectedValueOnce("something weird");

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("strange.pdf__1024")).toEqual({
        stage: "error",
        message: "Ingestion failed",
      });
    });

    it("posts correct form data to /api/ingest-document", async () => {
      const file = makeFile("upload.txt", 512);
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "complete", chunks: 1, source_doc_id: "id-1" }) + "\n"
            )
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("/api/ingest-document");
      expect(options?.method).toBe("POST");

      const body = options?.body as FormData;
      expect(body.get("collection")).toBe("my-col");
      expect(body.get("keyspace")).toBe("test-ks");
      expect(body.get("token")).toBe("test-token");
      expect(body.get("endpoint")).toBe("https://test.endpoint.com");
    });

    it("includes a trimmed Hugging Face key when one is provided", async () => {
      const file = makeFile("upload.txt", 512);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "complete", chunks: 1, source_doc_id: "id-2" }) + "\n"
            )
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      const { result } = renderHook(() =>
        useIngestUpload({ ...defaultArgs, huggingfaceApiKey: "  hf-token  " })
      );

      act(() => {
        result.current.addFiles([file]);
      });

      await act(async () => {
        await result.current.handleIngest();
      });

      const [, options] = vi.mocked(fetch).mock.calls[0];
      const body = options?.body as FormData;
      expect(body.get("huggingfaceApiKey")).toBe("hf-token");
    });

    it("tracks Ollama prepare events with fallback messaging before completion", async () => {
      const file = makeFile("prepare.pdf");
      let closeStream!: () => void;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "prepare",
                status: "running",
                determinate: false,
              }) + "\n"
            )
          );
          closeStream = () => {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "complete",
                  chunks: 1,
                  source_doc_id: "doc-prep",
                }) + "\n"
              )
            );
            controller.close();
          };
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      act(() => {
        void result.current.handleIngest();
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.fileStatuses.get("prepare.pdf__1024")).toEqual({
        stage: "preparing",
        message: "Preparing local model",
        model: undefined,
        completed: undefined,
        total: undefined,
        determinate: false,
      });

      await act(async () => {
        closeStream();
      });

      expect(result.current.fileStatuses.get("prepare.pdf__1024")).toEqual({
        stage: "done",
        chunks: 1,
      });
    });

    it("tracks determinate prepare progress when the model download reports totals", async () => {
      const file = makeFile("prepare-progress.pdf");
      let closeStream!: () => void;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "prepare",
                status: "running",
                message: "Downloading layers",
                model: "granite-embedding:278m",
                completed: 1024,
                total: 2048,
                determinate: true,
              }) + "\n"
            )
          );
          closeStream = () => {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "complete",
                  chunks: 1,
                  source_doc_id: "doc-prep-2",
                }) + "\n"
              )
            );
            controller.close();
          };
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      act(() => {
        void result.current.handleIngest();
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.fileStatuses.get("prepare-progress.pdf__1024")).toEqual({
        stage: "preparing",
        message: "Downloading layers",
        model: "granite-embedding:278m",
        completed: 1024,
        total: 2048,
        determinate: true,
      });

      await act(async () => {
        closeStream();
      });
    });

    it("sets uploading=false after completing all files", async () => {
      const file = makeFile("final.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "complete", chunks: 1, source_doc_id: "doc-fin" }) + "\n"
            )
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.uploading).toBe(false);
    });

    it("pauses on a filename conflict and resumes with overwrite when resolved", async () => {
      const file = makeFile("report.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const conflictStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "conflict",
                message:
                  'A different "report.pdf" is already ingested in this collection. Overwrite it or skip this upload.',
              }) + "\n"
            )
          );
          controller.close();
        },
      });
      const completeStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "complete",
                chunks: 3,
                source_doc_id: "doc-overwrite",
                replaced_source_doc_ids: ["doc-old"],
                md5_hash: "new-hash",
              }) + "\n"
            )
          );
          controller.close();
        },
      });

      vi.mocked(fetch)
        .mockResolvedValueOnce({ ok: true, body: conflictStream } as unknown as Response)
        .mockResolvedValueOnce({ ok: true, body: completeStream } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("report.pdf__1024")).toEqual({
        stage: "conflict",
        message:
          'A different "report.pdf" is already ingested in this collection. Overwrite it or skip this upload.',
      });
      expect(result.current.uploading).toBe(false);

      await act(async () => {
        result.current.resolveConflict(file, "overwrite", true);
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      const [, secondOptions] = vi.mocked(fetch).mock.calls[1];
      const secondBody = secondOptions?.body as FormData;
      expect(secondBody.get("nameConflictAction")).toBe("overwrite");
      expect(result.current.fileStatuses.get("report.pdf__1024")).toEqual({
        stage: "done",
        chunks: 3,
      });
    });

    it("uses a fallback filename conflict message when the stream omits one", async () => {
      const file = makeFile("fallback-conflict.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const conflictStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "conflict" }) + "\n")
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: conflictStream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("fallback-conflict.pdf__1024")).toEqual({
        stage: "conflict",
        message:
          'A different "fallback-conflict.pdf" is already in this collection.',
      });
    });

    it("marks conflicts as skipped without retrying when the user chooses skip", async () => {
      const file = makeFile("report.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const conflictStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "conflict",
                message:
                  'A different "report.pdf" is already ingested in this collection. Overwrite it or skip this upload.',
              }) + "\n"
            )
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: conflictStream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      await act(async () => {
        result.current.resolveConflict(file, "skip", false);
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.current.fileStatuses.get("report.pdf__1024")).toEqual({
        stage: "skipped",
        message:
          'Skipped "report.pdf" because a different file with that name is already in this collection.',
      });
    });

    it("treats duplicate-hash responses as skipped uploads", async () => {
      const file = makeFile("duplicate.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const skippedStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "skipped",
                reason: "duplicate_hash",
                message:
                  'Already ingested as "original.pdf" on 4/9/2026, 8:00:00 PM; skipping duplicate upload.',
              }) + "\n"
            )
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: skippedStream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("duplicate.pdf__1024")).toEqual({
        stage: "skipped",
        message:
          'Already ingested as "original.pdf" on 4/9/2026, 8:00:00 PM; skipping duplicate upload.',
      });
    });

    it("uses a fallback skip message when the stream omits one", async () => {
      const file = makeFile("skipped.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const skippedStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "skipped" }) + "\n")
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: skippedStream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("skipped.pdf__1024")).toEqual({
        stage: "skipped",
        message: 'Skipped "skipped.pdf".',
      });
    });

    it("surfaces JSON error responses when the route rejects before streaming", async () => {
      const file = makeFile("invalid.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Upload rejected" }),
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("invalid.pdf__1024")).toEqual({
        stage: "error",
        message: "Upload rejected",
      });
    });

    it("falls back to a generic error when a failed response cannot be parsed", async () => {
      const file = makeFile("invalid-json.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockRejectedValue(new Error("bad json")),
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("invalid-json.pdf__1024")).toEqual({
        stage: "error",
        message: "Ingestion failed",
      });
    });

    it("ignores blank ndjson lines while processing the stream", async () => {
      const file = makeFile("blank-lines.pdf");
      const { result } = renderHook(() => useIngestUpload(defaultArgs));

      act(() => {
        result.current.addFiles([file]);
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              "\n" +
                JSON.stringify({
                  type: "complete",
                  chunks: 1,
                  source_doc_id: "doc-blank",
                }) +
                "\n"
            )
          );
          controller.close();
        },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: stream,
      } as unknown as Response);

      await act(async () => {
        await result.current.handleIngest();
      });

      expect(result.current.fileStatuses.get("blank-lines.pdf__1024")).toEqual({
        stage: "done",
        chunks: 1,
      });
    });
  });
});
