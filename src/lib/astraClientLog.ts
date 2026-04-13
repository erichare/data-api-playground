/**
 * Request-scoped logging of Astra DB TypeScript client calls.
 *
 * Uses `AsyncLocalStorage` to isolate call logs per HTTP request, preventing
 * cross-request pollution. The API Explorer's "Code" tab consumes these
 * recorded calls to display live TypeScript SDK examples.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** A recorded Astra DB SDK call with its TypeScript representation. */
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

/** Shared fallback log used outside a request scope. */
const globalEntries: AstraClientCallEntry[] = [];

const requestLogStorage = new AsyncLocalStorage<AstraClientCallEntry[]>();

function getEntries(): AstraClientCallEntry[] {
  return requestLogStorage.getStore() ?? globalEntries;
}

/**
 * Run `fn` with a request-scoped client-call log.
 * Entries recorded inside `fn` are isolated from other concurrent requests.
 */
export function withRequestLog<T>(fn: () => T): T {
  return requestLogStorage.run([], fn);
}

/** Return the most recent recorded calls, scoped to the current request if available. */
export function listAstraClientCalls(limit = 60): AstraClientCallEntry[] {
  return getEntries().slice(0, limit);
}

/** Clear all recorded calls in the current scope. */
export function clearAstraClientCalls() {
  getEntries().length = 0;
}

/** Record an Astra DB SDK call for display in the API Explorer. */
export function recordAstraClientCall(input: {
  label: string;
  code: string;
  timestamp?: string;
}) {
  const entry: AstraClientCallEntry = {
    id: crypto.randomUUID(),
    label: input.label,
    code: input.code,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  // Always record to the global log (consumed by typescript-client-calls endpoint)
  globalEntries.unshift(entry);
  if (globalEntries.length > MAX_ASTRA_CLIENT_CALL_ENTRIES) {
    globalEntries.length = MAX_ASTRA_CLIENT_CALL_ENTRIES;
  }

  // Also record to the request-scoped log if one exists
  const requestEntries = requestLogStorage.getStore();
  if (requestEntries) {
    requestEntries.unshift(entry);
    if (requestEntries.length > MAX_ASTRA_CLIENT_CALL_ENTRIES) {
      requestEntries.length = MAX_ASTRA_CLIENT_CALL_ENTRIES;
    }
  }
}

/** Create a raw TypeScript snippet that will be emitted verbatim (not JSON-stringified). */
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

/** Serialize a value as TypeScript source code. Handles raw snippets and JSON-safe values. */
export function formatTsValue(value: unknown): string {
  if (isRawTsSnippet(value)) {
    return value.value;
  }

  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? "undefined" : serialized;
}

/** Format a method call as TypeScript (e.g., `.find({}, { limit: 5 })`). Auto-wraps long arguments. */
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

/** Build a complete `await base.method().method()` TypeScript call string from a chain of method calls. */
export function buildTsCall(base: string, chain: string[]) {
  return [`await ${base}`, ...chain.map((line) => `  ${line}`)].join("\n");
}
