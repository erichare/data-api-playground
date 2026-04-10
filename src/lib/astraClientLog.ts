export interface AstraClientCallEntry {
  id: string;
  label: string;
  code: string;
  timestamp: string;
}

interface RawTsSnippet {
  __rawTsSnippet: true;
  value: string;
}

const MAX_ASTRA_CLIENT_CALL_ENTRIES = 200;
const astraClientCallEntries: AstraClientCallEntry[] = [];

export function listAstraClientCalls(limit = 60): AstraClientCallEntry[] {
  return astraClientCallEntries.slice(0, limit);
}

export function clearAstraClientCalls() {
  astraClientCallEntries.length = 0;
}

export function recordAstraClientCall(input: {
  label: string;
  code: string;
  timestamp?: string;
}) {
  astraClientCallEntries.unshift({
    id: crypto.randomUUID(),
    label: input.label,
    code: input.code,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });

  if (astraClientCallEntries.length > MAX_ASTRA_CLIENT_CALL_ENTRIES) {
    astraClientCallEntries.length = MAX_ASTRA_CLIENT_CALL_ENTRIES;
  }
}

export function rawTs(value: string): RawTsSnippet {
  return {
    __rawTsSnippet: true,
    value,
  };
}

function isRawTsSnippet(value: unknown): value is RawTsSnippet {
  return (
    typeof value === "object" &&
    value !== null &&
    "__rawTsSnippet" in value &&
    value.__rawTsSnippet === true
  );
}

function indent(text: string, spaces: number) {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function formatTsValue(value: unknown): string {
  if (isRawTsSnippet(value)) {
    return value.value;
  }

  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? "undefined" : serialized;
}

export function formatTsMethodCall(method: string, args: unknown[]) {
  const serializedArgs = args.map((arg) => formatTsValue(arg));

  if (serializedArgs.length === 0) {
    return `.${method}()`;
  }

  const inline = serializedArgs.join(", ");
  if (
    inline.length <= 80 &&
    serializedArgs.every((arg) => !arg.includes("\n"))
  ) {
    return `.${method}(${inline})`;
  }

  return `.${method}(\n${serializedArgs
    .map((arg) => indent(arg, 4))
    .join(",\n")}\n  )`;
}

export function buildTsCall(base: string, chain: string[]) {
  return [`await ${base}`, ...chain.map((line) => `  ${line}`)].join("\n");
}
