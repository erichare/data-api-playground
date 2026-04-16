import type { BackendConnectionState, DataApiBackendKind } from "@/lib/backends/types";
import { resolveBackendConnection } from "@/lib/backends/server";
import { astraDataApiBackend } from "@/lib/dataApi/astraBackend";
import { hcdDataApiBackend } from "@/lib/dataApi/hcdBackend";
import type { DataApiBackend } from "@/lib/dataApi/types";

export { astraDataApiBackend } from "@/lib/dataApi/astraBackend";
export { hcdDataApiBackend } from "@/lib/dataApi/hcdBackend";
export type * from "@/lib/dataApi/types";

export function getDataApiBackend(kind: DataApiBackendKind): DataApiBackend {
  switch (kind) {
    case "hcd":
      return hcdDataApiBackend;
    case "astra":
    default:
      return astraDataApiBackend;
  }
}

export function resolveDataApiBackend(
  input: Parameters<typeof resolveBackendConnection>[0],
  options?: Parameters<typeof resolveBackendConnection>[1]
) {
  const config = resolveBackendConnection(input, options);
  const backend = getDataApiBackend(config.backend);
  return { config, backend, capabilities: backend.capabilities };
}

export function getResolvedDataApiBackend(config: BackendConnectionState) {
  return getDataApiBackend(config.backend);
}
