import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, validateRegistration, publicName, normaliseEmail, MIN_PASSWORD_LENGTH } from "./accounts";

describe("account passwords", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("Correct horse battery", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("carries its parameters, so they can be raised later", async () => {
    const [scheme, n, r, p] = (await hashPassword("x".repeat(12))).split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(16384);
    expect([Number(r), Number(p)]).toEqual([8, 1]);
  });

  it("refuses a hash it does not understand", async () => {
    expect(await verifyPassword("anything", "md5$deadbeef")).toBe(false);
  });
});

describe("registration rules", () => {
  const good = { email: "Person@Example.com", password: "x".repeat(MIN_PASSWORD_LENGTH), displayName: "A Person" };

  it("accepts a reasonable registration", () => {
    expect(validateRegistration(good)).toBeNull();
    expect(normaliseEmail(" Person@Example.COM ")).toBe("person@example.com");
  });

  it("names the field a person has to fix", () => {
    expect(validateRegistration({ ...good, email: "not-an-email" })?.field).toBe("email");
    expect(validateRegistration({ ...good, password: "short" })?.field).toBe("password");
    expect(validateRegistration({ ...good, displayName: "A" })?.field).toBe("displayName");
    expect(validateRegistration({ ...good, alias: "no/slashes" })?.field).toBe("alias");
  });

  it("accepts an Arabic leaderboard name", () => {
    expect(validateRegistration({ ...good, alias: "محمد" })).toBeNull();
  });

  it("shows the alias publicly when there is one", () => {
    expect(publicName({ alias: "botmaster", displayName: "A Person" })).toBe("botmaster");
    expect(publicName({ alias: null, displayName: "A Person" })).toBe("A Person");
    expect(publicName({ alias: "   ", displayName: "A Person" })).toBe("A Person");
  });
});
