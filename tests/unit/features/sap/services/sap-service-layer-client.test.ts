jest.mock("@/features/sap/services/sap-http", () => ({
  sapHttpRequest: jest.fn(),
}));

jest.mock("@/lib/cache/redis", () => ({
  cacheKey: (...parts: string[]) => parts.join(":"),
  deleteCache: jest.fn(),
  getCache: jest.fn(),
  setCache: jest.fn(),
  setIfNotExists: jest.fn(),
}));

import { sapHttpRequest } from "@/features/sap/services/sap-http";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import {
  normalizeBaseUrl,
  sapSessionManager,
} from "@/features/sap/services/sap-session-manager";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

const httpRequest = sapHttpRequest as jest.Mock;

const creds: SapServiceLayerCredentials = {
  id: "cfg-1",
  baseUrl: "https://sap.example:50000/b1s/v1/Login",
  companyDb: "DB",
  username: "manager",
  password: "not-a-real-secret",
  isEnabled: true,
  verifySsl: false,
  languageCode: "23",
};

beforeEach(() => {
  jest.spyOn(sapSessionManager, "getSession").mockResolvedValue({
    configId: creds.id,
    cookies: "B1SESSION=session-value; ROUTEID=.node1",
    sessionId: "session-value",
    expiresAt: Date.now() + 60_000,
    companyDbFingerprint: "fp",
  });
  httpRequest.mockResolvedValue({
    statusCode: 200,
    body: "{}",
    headers: {},
    cookieHeader: null,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("normalizeBaseUrl", () => {
  it("drops a pasted login page so entity calls stay on the service root", () => {
    expect(normalizeBaseUrl("https://sap.example:50000/b1s/v1/Login")).toBe(
      "https://sap.example:50000/b1s/v1",
    );
    expect(normalizeBaseUrl("https://sap.example:50000/b1s/v1/login/")).toBe(
      "https://sap.example:50000/b1s/v1",
    );
    expect(normalizeBaseUrl("https://sap.example:50000/b1s/v1")).toBe(
      "https://sap.example:50000/b1s/v1",
    );
  });
});

describe("sapServiceLayerClient.request", () => {
  it("calls the service root with the connected session cookie", async () => {
    await sapServiceLayerClient.request({
      creds,
      method: "GET",
      path: "/SerialNumberDetails?$select=DocEntry",
      headers: { Prefer: "odata.maxpagesize=20" },
    });

    expect(sapSessionManager.getSession).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://sap.example:50000/b1s/v1/Login" }),
    );
    expect(httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://sap.example:50000/b1s/v1/SerialNumberDetails?$select=DocEntry",
        headers: {
          Prefer: "odata.maxpagesize=20",
          Cookie: "B1SESSION=session-value; ROUTEID=.node1",
        },
      }),
    );
  });
});
