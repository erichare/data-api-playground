import type {
  EnsureModelProgress,
  ResolvedAiBackend,
} from "@/lib/ai/service";
import type { IngestPrepareEvent } from "@/lib/ingest/types";

export function createPrepareTracker(
  send: (event: Record<string, unknown> | IngestPrepareEvent) => void
) {
  return async function withPrepareTracking<T>(args: {
    backend: ResolvedAiBackend;
    kind: "chat" | "embed";
    task: (
      onPrepareProgress: (progress: EnsureModelProgress) => void
    ) => Promise<T>;
  }): Promise<T> {
    const { backend, kind, task } = args;
    if (backend.provider !== "ollama") {
      return task(() => undefined);
    }

    const prepareStart = Date.now();
    let sawProgress = false;
    let downloaded = false;
    let finalModel = kind === "chat" ? backend.chatModel : backend.embedModel;

    const onPrepareProgress = (progress: EnsureModelProgress) => {
      sawProgress = true;
      finalModel = progress.model;
      if (progress.status !== "Model already installed") {
        downloaded = true;
      }

      send({
        type: "prepare",
        status: "running",
        provider: progress.provider,
        model: progress.model,
        kind: progress.kind,
        message: progress.status,
        ...(typeof progress.completed === "number"
          ? { completed: progress.completed }
          : {}),
        ...(typeof progress.total === "number" ? { total: progress.total } : {}),
        determinate: progress.determinate,
      });
    };

    const result = await task(onPrepareProgress);

    if (sawProgress) {
      send({
        type: "prepare",
        status: "complete",
        provider: backend.provider,
        model: finalModel,
        kind,
        downloaded,
        latencyMs: Date.now() - prepareStart,
      });
    }

    return result;
  };
}
