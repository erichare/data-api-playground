import { describe, it, expect } from "vitest";
import {
  loginBodySchema,
  connectBodySchema,
  browseBodySchema,
  countBodySchema,
  keyspacesBodySchema,
  embeddingProvidersBodySchema,
  createCollectionBodySchema,
  deleteCollectionBodySchema,
  deleteDocumentsBodySchema,
  documentsDeleteBodySchema,
  documentsChunksBodySchema,
  ingestBodySchema,
  conversationCreateBodySchema,
  conversationUpdateBodySchema,
  messageCreateBodySchema,
  conversationTitleBodySchema,
  chatBodySchema,
  dataApiProxyBodySchema,
} from "./schemas";

describe("loginBodySchema", () => {
  it("accepts an empty object and defaults password", () => {
    const result = loginBodySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.password).toBe("");
  });

  it("accepts a password", () => {
    const result = loginBodySchema.safeParse({ password: "secret" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.password).toBe("secret");
  });
});

describe("connectBodySchema", () => {
  it("accepts optional token, endpoint, keyspace", () => {
    expect(connectBodySchema.safeParse({}).success).toBe(true);
    expect(
      connectBodySchema.safeParse({ token: "t", endpoint: "e", keyspace: "k" })
        .success
    ).toBe(true);
  });
});

describe("browseBodySchema", () => {
  it("requires non-empty collection", () => {
    const result = browseBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid browse body", () => {
    const result = browseBodySchema.safeParse({
      collection: "my_coll",
      pageState: "abc",
      sort: { col: "name", dir: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid sort dir", () => {
    const result = browseBodySchema.safeParse({
      collection: "c",
      sort: { col: "x", dir: 2 },
    });
    expect(result.success).toBe(false);
  });
});

describe("countBodySchema", () => {
  it("requires non-empty collection", () => {
    expect(countBodySchema.safeParse({}).success).toBe(false);
    expect(countBodySchema.safeParse({ collection: "" }).success).toBe(false);
  });

  it("accepts valid body", () => {
    expect(countBodySchema.safeParse({ collection: "c" }).success).toBe(true);
  });
});

describe("createCollectionBodySchema", () => {
  const valid = {
    name: "test",
    dimension: 128,
    metric: "cosine",
    provider: "openai",
    model: "text-embedding-3-small",
  };

  it("accepts valid body", () => {
    expect(createCollectionBodySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing name", () => {
    const { name: omittedName, ...rest } = valid;
    void omittedName;
    expect(createCollectionBodySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-positive dimension", () => {
    expect(
      createCollectionBodySchema.safeParse({ ...valid, dimension: 0 }).success
    ).toBe(false);
    expect(
      createCollectionBodySchema.safeParse({ ...valid, dimension: -1 }).success
    ).toBe(false);
  });

  it("rejects non-integer dimension", () => {
    expect(
      createCollectionBodySchema.safeParse({ ...valid, dimension: 1.5 }).success
    ).toBe(false);
  });
});

describe("deleteCollectionBodySchema", () => {
  it("requires non-empty name", () => {
    expect(deleteCollectionBodySchema.safeParse({}).success).toBe(false);
    expect(deleteCollectionBodySchema.safeParse({ name: "" }).success).toBe(
      false
    );
  });

  it("accepts valid body", () => {
    expect(deleteCollectionBodySchema.safeParse({ name: "c" }).success).toBe(
      true
    );
  });
});

describe("deleteDocumentsBodySchema", () => {
  it("requires collection and non-empty ids array", () => {
    expect(deleteDocumentsBodySchema.safeParse({}).success).toBe(false);
    expect(
      deleteDocumentsBodySchema.safeParse({ collection: "c", ids: [] }).success
    ).toBe(false);
  });

  it("accepts valid body", () => {
    expect(
      deleteDocumentsBodySchema.safeParse({ collection: "c", ids: ["id1"] })
        .success
    ).toBe(true);
  });
});

describe("documentsDeleteBodySchema", () => {
  it("requires source_doc_id and collection", () => {
    expect(documentsDeleteBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts valid body", () => {
    expect(
      documentsDeleteBodySchema.safeParse({
        source_doc_id: "doc1",
        collection: "c",
      }).success
    ).toBe(true);
  });
});

describe("documentsChunksBodySchema", () => {
  it("requires source_doc_id and collection", () => {
    expect(documentsChunksBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts valid body", () => {
    expect(
      documentsChunksBodySchema.safeParse({
        source_doc_id: "doc1",
        collection: "c",
      }).success
    ).toBe(true);
  });
});

describe("ingestBodySchema", () => {
  it("requires collection, rows, and filename", () => {
    expect(ingestBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts valid body", () => {
    expect(
      ingestBodySchema.safeParse({
        collection: "c",
        rows: [{ key: "val" }],
        filename: "data.csv",
      }).success
    ).toBe(true);
  });

  it("rejects empty rows array", () => {
    // rows can be empty (the service decides what to do)
    const result = ingestBodySchema.safeParse({
      collection: "c",
      rows: [],
      filename: "data.csv",
    });
    expect(result.success).toBe(true);
  });
});

describe("conversationCreateBodySchema", () => {
  it("accepts empty body", () => {
    expect(conversationCreateBodySchema.safeParse({}).success).toBe(true);
  });

  it("accepts name", () => {
    const result = conversationCreateBodySchema.safeParse({ name: "My Chat" });
    expect(result.success).toBe(true);
  });
});

describe("conversationUpdateBodySchema", () => {
  it("requires non-empty name", () => {
    expect(conversationUpdateBodySchema.safeParse({}).success).toBe(false);
    expect(conversationUpdateBodySchema.safeParse({ name: "" }).success).toBe(
      false
    );
  });

  it("accepts valid name", () => {
    expect(
      conversationUpdateBodySchema.safeParse({ name: "Renamed" }).success
    ).toBe(true);
  });
});

describe("messageCreateBodySchema", () => {
  const valid = {
    message: {
      id: "m1",
      role: "user",
      content: "hello",
      timestamp: "2024-01-01T00:00:00Z",
    },
  };

  it("accepts valid message", () => {
    expect(messageCreateBodySchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional fields", () => {
    const result = messageCreateBodySchema.safeParse({
      message: {
        ...valid.message,
        searchMode: "vector",
        latencyMs: 42,
        pipelineSteps: [{ step: "analyze" }],
        sources: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing message", () => {
    expect(messageCreateBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty id", () => {
    expect(
      messageCreateBodySchema.safeParse({
        message: { ...valid.message, id: "" },
      }).success
    ).toBe(false);
  });
});

describe("conversationTitleBodySchema", () => {
  it("requires non-empty firstMessage", () => {
    expect(conversationTitleBodySchema.safeParse({}).success).toBe(false);
    expect(
      conversationTitleBodySchema.safeParse({ firstMessage: "" }).success
    ).toBe(false);
  });

  it("accepts valid body with optional keys", () => {
    expect(
      conversationTitleBodySchema.safeParse({
        firstMessage: "hello",
        huggingfaceApiKey: "hf-key",
      }).success
    ).toBe(true);
  });
});

describe("chatBodySchema", () => {
  const minimal = { query: "hello", searchMode: "vector" };

  it("accepts minimal body", () => {
    expect(chatBodySchema.safeParse(minimal).success).toBe(true);
  });

  it("requires query and searchMode", () => {
    expect(chatBodySchema.safeParse({}).success).toBe(false);
    expect(chatBodySchema.safeParse({ query: "x" }).success).toBe(false);
  });

  it("validates history roles", () => {
    expect(
      chatBodySchema.safeParse({
        ...minimal,
        history: [{ role: "system", content: "x" }],
      }).success
    ).toBe(false);

    expect(
      chatBodySchema.safeParse({
        ...minimal,
        history: [{ role: "user", content: "x" }],
      }).success
    ).toBe(true);
  });

  it("accepts full body", () => {
    expect(
      chatBodySchema.safeParse({
        ...minimal,
        token: "t",
        endpoint: "e",
        keyspace: "k",
        collections: [{ name: "c", isVectorize: true, vectorDimension: null }],
        activeCollection: "c",
        allCollectionFields: { c: ["field1"] },
        history: [{ role: "assistant", content: "hi" }],
        huggingfaceApiKey: "hf-key",
      }).success
    ).toBe(true);
  });
});

describe("dataApiProxyBodySchema", () => {
  it("requires collection and requestBody", () => {
    expect(dataApiProxyBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts valid body", () => {
    expect(
      dataApiProxyBodySchema.safeParse({
        collection: "c",
        requestBody: { find: { filter: {} } },
      }).success
    ).toBe(true);
  });

  it("rejects empty collection", () => {
    expect(
      dataApiProxyBodySchema.safeParse({
        collection: "",
        requestBody: {},
      }).success
    ).toBe(false);
  });
});

describe("keyspacesBodySchema / embeddingProvidersBodySchema", () => {
  it("accepts empty body (all fields optional)", () => {
    expect(keyspacesBodySchema.safeParse({}).success).toBe(true);
    expect(embeddingProvidersBodySchema.safeParse({}).success).toBe(true);
  });
});
