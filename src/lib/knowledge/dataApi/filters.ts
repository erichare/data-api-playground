const ALLOWED_FILTER_OPS = new Set([
  "$eq", "$ne", "$lt", "$lte", "$gt", "$gte", "$in", "$nin", "$exists",
]);
const SAFE_FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

export type SafeFilterPrimitive = string | number | boolean;

export function sanitizeFilterOp(op: string | null): string | null {
  if (!op) return null;
  return ALLOWED_FILTER_OPS.has(op) ? op : null;
}

export function sanitizeFilterField(field: string | null): string | null {
  if (!field) return null;
  if (field.startsWith("$")) return null;
  if (!SAFE_FIELD_NAME_RE.test(field)) return null;
  return field;
}

export function isSafeFilterValue(
  value: unknown
): value is SafeFilterPrimitive | SafeFilterPrimitive[] {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  return Array.isArray(value) && value.every((entry) => {
    return (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    );
  });
}

export function buildFilterClause(args: {
  field: string | null;
  op: string | null;
  value: unknown;
}): { filter: Record<string, unknown>; filterString: string } {
  const safeField = sanitizeFilterField(args.field);
  const safeOp = sanitizeFilterOp(args.op);
  const safeValue = isSafeFilterValue(args.value) ? args.value : null;

  if (!safeField || safeValue == null) {
    return { filter: {}, filterString: "{}" };
  }

  if (!safeOp || safeOp === "$eq") {
    return {
      filter: { [safeField]: safeValue },
      filterString: `{ ${safeField}: ${JSON.stringify(safeValue)} }`,
    };
  }

  return {
    filter: { [safeField]: { [safeOp]: safeValue } },
    filterString: `{ ${safeField}: { ${safeOp}: ${JSON.stringify(safeValue)} } }`,
  };
}
