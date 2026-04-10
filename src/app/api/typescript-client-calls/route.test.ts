import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAstraClientCalls,
  recordAstraClientCall,
} from "@/lib/astraClientLog";

describe("/api/typescript-client-calls route", () => {
  beforeEach(() => {
    clearAstraClientCalls();
  });

  it("returns the most recent TypeScript client call entries", async () => {
    recordAstraClientCall({
      label: "Browse Collection",
      code: 'await db.collection("orders")\n  .find({}, { limit: 20 })\n  .toArray()',
      timestamp: "2026-04-10T12:00:00.000Z",
    });

    const { GET } = await import("./route");
    const request = new Request(
      "http://localhost/api/typescript-client-calls?limit=5"
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      calls: [
        {
          label: "Browse Collection",
          code: 'await db.collection("orders")\n  .find({}, { limit: 20 })\n  .toArray()',
          timestamp: "2026-04-10T12:00:00.000Z",
        },
      ],
    });
  });
});
