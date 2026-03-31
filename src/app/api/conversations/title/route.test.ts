import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const textChatMock = vi.fn();
const newInstanceMock = vi.fn(() => ({
  textChat: textChatMock,
}));
const iamAuthenticatorMock = vi.fn();

vi.mock("@ibm-cloud/watsonx-ai", () => ({
  WatsonXAI: {
    newInstance: newInstanceMock,
  },
}));

vi.mock("ibm-cloud-sdk-core", () => ({
  IamAuthenticator: iamAuthenticatorMock,
}));

describe("/api/conversations/title route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;
  const originalApiKey = process.env.WATSONX_API_KEY;
  const originalProjectId = process.env.WATSONX_PROJECT_ID;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;

    if (originalApiKey === undefined) delete process.env.WATSONX_API_KEY;
    else process.env.WATSONX_API_KEY = originalApiKey;

    if (originalProjectId === undefined) delete process.env.WATSONX_PROJECT_ID;
    else process.env.WATSONX_PROJECT_ID = originalProjectId;
  });

  it("returns null when watsonx credentials are unavailable", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstMessage: "hello" }),
      }) as never
    );

    expect(await response.json()).toEqual({ title: null });
    expect(newInstanceMock).not.toHaveBeenCalled();
  });

  it("generates and sanitizes a short title", async () => {
    process.env.WATSONX_API_KEY = "watsonx-key";
    process.env.WATSONX_PROJECT_ID = "project-1";
    textChatMock.mockResolvedValueOnce({
      result: {
        choices: [
          {
            message: {
              content: '"Customer Feedback Trends"',
            },
          },
        ],
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstMessage: "Summarize my customer feedback trends" }),
      }) as never
    );

    expect(await response.json()).toEqual({
      title: "Customer Feedback Trends",
    });
    expect(iamAuthenticatorMock).toHaveBeenCalledWith({ apikey: "watsonx-key" });
    expect(newInstanceMock).toHaveBeenCalled();
    expect(textChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        modelId: "ibm/granite-3-8b-instruct",
      })
    );
  });

  it("returns null when title generation fails", async () => {
    process.env.WATSONX_API_KEY = "watsonx-key";
    process.env.WATSONX_PROJECT_ID = "project-1";
    textChatMock.mockRejectedValueOnce(new Error("watsonx failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstMessage: "hello" }),
      }) as never
    );

    expect(await response.json()).toEqual({ title: null });
  });
});
