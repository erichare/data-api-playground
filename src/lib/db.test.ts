import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mkdirSyncMock = vi.fn();
const pragmaMock = vi.fn();
const execMock = vi.fn();
const DatabaseMock = vi.fn(function Database() {
  return {
    pragma: pragmaMock,
    exec: execMock,
  };
});

vi.mock("fs", () => ({
  default: { mkdirSync: mkdirSyncMock },
  mkdirSync: mkdirSyncMock,
}));

vi.mock("better-sqlite3", () => ({
  default: DatabaseMock,
}));

describe("getDb", () => {
  const originalPath = process.env.DATA_API_PLAYGROUND_DB_PATH;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.DATA_API_PLAYGROUND_DB_PATH;
    } else {
      process.env.DATA_API_PLAYGROUND_DB_PATH = originalPath;
    }
  });

  it("creates the parent directory for an overridden database path", async () => {
    process.env.DATA_API_PLAYGROUND_DB_PATH = "/tmp/data-api-playground/custom/app.db";

    const { getDb } = await import("./db");

    getDb();

    expect(mkdirSyncMock).toHaveBeenCalledWith(
      "/tmp/data-api-playground/custom",
      { recursive: true }
    );
    expect(DatabaseMock).toHaveBeenCalledWith(
      "/tmp/data-api-playground/custom/app.db"
    );
    expect(pragmaMock).toHaveBeenCalledWith("journal_mode = WAL");
    expect(pragmaMock).toHaveBeenCalledWith("foreign_keys = ON");
    expect(execMock).toHaveBeenCalledTimes(3);
  });
});
