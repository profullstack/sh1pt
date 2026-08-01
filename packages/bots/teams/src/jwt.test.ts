import { describe, expect, it } from "vitest";
import { decodeBotFrameworkJwt } from "./jwt.js";

function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("decodeBotFrameworkJwt", () => {
  it("decodes a three-part Bot Framework token", () => {
    const header = segment({ alg: "RS256", kid: "key-1" });
    const payload = segment({ aud: "app-1", exp: 2_000_000_000 });
    const signature = Buffer.from("signed-bytes").toString("base64url");

    expect(decodeBotFrameworkJwt(`${header}.${payload}.${signature}`)).toMatchObject({
      header: { alg: "RS256", kid: "key-1" },
      payload: { aud: "app-1", exp: 2_000_000_000 },
      signed: `${header}.${payload}`,
    });
  });

  it("rejects tokens with the wrong number of parts", () => {
    expect(() => decodeBotFrameworkJwt("one.two")).toThrow("must have three parts");
  });

  it("rejects empty token parts", () => {
    expect(() => decodeBotFrameworkJwt(`${segment({})}..signature`)).toThrow("part missing");
  });

  it("rejects invalid Base64URL characters", () => {
    expect(() => decodeBotFrameworkJwt(`***.${segment({})}.signature`)).toThrow("not valid Base64URL");
  });

  it("rejects malformed JSON segments", () => {
    const invalidJson = Buffer.from("not-json").toString("base64url");
    expect(() => decodeBotFrameworkJwt(`${invalidJson}.${segment({})}.signature`)).toThrow("header is not valid JSON");
  });

  it("rejects non-object headers and payloads", () => {
    expect(() => decodeBotFrameworkJwt(`${segment([])}.${segment({})}.signature`)).toThrow("header must be an object");
    expect(() => decodeBotFrameworkJwt(`${segment({})}.${segment([])}.signature`)).toThrow("payload must be an object");
  });
});
