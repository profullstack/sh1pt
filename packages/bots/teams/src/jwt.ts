export interface ParsedJwt {
  header: {
    alg?: string;
    kid?: string;
    x5t?: string;
  };
  payload: {
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
    serviceurl?: string;
    serviceUrl?: string;
  };
  signed: string;
  signature: Buffer;
}

export function decodeBotFrameworkJwt(token: string): ParsedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Bot Framework JWT must have three parts");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Bot Framework JWT part missing");

  const header = decodeJsonObject(encodedHeader, "header");
  const payload = decodeJsonObject(encodedPayload, "payload");
  return {
    header: header as ParsedJwt["header"],
    payload: payload as ParsedJwt["payload"],
    signed: `${encodedHeader}.${encodedPayload}`,
    signature: decodeBase64Url(encodedSignature, "signature"),
  };
}

function decodeJsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(value, label).toString("utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Bot Framework JWT")) throw error;
    throw new Error(`Bot Framework JWT ${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Bot Framework JWT ${label} must be an object`);
  }
  return parsed as Record<string, unknown>;
}

function decodeBase64Url(value: string, label: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error(`Bot Framework JWT ${label} is not valid Base64URL`);
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64");
}
