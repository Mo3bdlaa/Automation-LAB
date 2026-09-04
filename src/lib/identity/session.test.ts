import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession, SESSION_TTL_SECONDS } from "./session";

describe("session cookie", () => {
  it("round-trips and rejects tampering", () => {
    const tok = encodeSession("usr_1");
    expect(decodeSession(tok)?.userId).toBe("usr_1");
    expect(decodeSession(tok.slice(0, -2) + "zz")).toBeNull();
    expect(decodeSession("garbage")).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });
  it("expires after 30 days", () => {
    const now = Date.now();
    const tok = encodeSession("usr_1", now);
    expect(decodeSession(tok, now + (SESSION_TTL_SECONDS - 10) * 1000)).not.toBeNull();
    expect(decodeSession(tok, now + (SESSION_TTL_SECONDS + 10) * 1000)).toBeNull();
  });
});
