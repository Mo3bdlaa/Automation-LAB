/**
 * The S3 store against a stand-in server.
 *
 * What this proves: the four verbs round-trip, keys map to the right URLs,
 * a missing object reads as null rather than throwing, prefix deletion walks
 * the listing, and the Authorization header is a well-formed SigV4 header with
 * the right scope and signed headers.
 *
 * What it does not prove: that AWS or R2 accept the signature. That needs real
 * credentials against a real bucket, and is the one thing to check by hand
 * before an event — `pnpm blob:check` does it in about two seconds.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createS3BlobStore } from "./index";

const objects = new Map<string, Buffer>();
const seenAuth: string[] = [];
let server: Server;
let endpoint: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    seenAuth.push(req.headers.authorization ?? "");
    const url = new URL(req.url!, "http://localhost");
    // A listing rather than an object: /bucket?list-type=2&prefix=...
    if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const keys = [...objects.keys()].filter((k) => k.startsWith(`bucket/${prefix}`));
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(`<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${keys
        .map((k) => `<Contents><Key>${k.replace(/^bucket\//, "")}</Key></Contents>`)
        .join("")}</ListBucketResult>`);
      return;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        objects.set(key, Buffer.concat(chunks));
        res.writeHead(200).end();
      });
      return;
    }
    if (req.method === "GET") {
      const body = objects.get(key);
      if (!body) return void res.writeHead(404).end();
      return void res.writeHead(200).end(body);
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      return void res.writeHead(204).end();
    }
    res.writeHead(405).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  endpoint = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const store = () =>
  createS3BlobStore({
    endpoint,
    bucket: "bucket",
    region: "auto",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secretexamplekey",
  });

describe("s3 blob store", () => {
  it("round-trips an object", async () => {
    const s = store();
    const data = new Uint8Array([37, 80, 68, 70]); // %PDF
    const { size } = await s.put("tenants/t1/documents/d1/L1.pdf", data, "application/pdf");
    expect(size).toBe(4);
    expect(await s.get("tenants/t1/documents/d1/L1.pdf")).toEqual(data);
  });

  it("reads a missing object as null instead of throwing", async () => {
    expect(await store().get("tenants/t1/documents/nope/L1.pdf")).toBeNull();
  });

  it("deletes an object", async () => {
    const s = store();
    await s.put("tenants/t1/documents/d2/L1.pdf", new Uint8Array([1]), "application/pdf");
    await s.delete("tenants/t1/documents/d2/L1.pdf");
    expect(await s.get("tenants/t1/documents/d2/L1.pdf")).toBeNull();
  });

  it("deletes a whole prefix, which is what resetting a sandbox needs", async () => {
    const s = store();
    await s.put("tenants/t9/documents/a/L1.pdf", new Uint8Array([1]), "application/pdf");
    await s.put("tenants/t9/documents/b/L1.pdf", new Uint8Array([2]), "application/pdf");
    await s.put("tenants/keep/documents/c/L1.pdf", new Uint8Array([3]), "application/pdf");
    await s.deletePrefix("tenants/t9");
    expect(await s.get("tenants/t9/documents/a/L1.pdf")).toBeNull();
    expect(await s.get("tenants/t9/documents/b/L1.pdf")).toBeNull();
    expect(await s.get("tenants/keep/documents/c/L1.pdf")).not.toBeNull();
  });

  it("refuses a key that would climb out of the bucket", async () => {
    await expect(store().put("../../etc/passwd", new Uint8Array([1]), "text/plain")).rejects.toThrow(/Unsafe blob key/);
  });

  it("signs with a well-formed SigV4 header", async () => {
    seenAuth.length = 0;
    await store().put("tenants/t1/documents/d3/L1.pdf", new Uint8Array([1]), "application/pdf");
    const auth = seenAuth.at(-1)!;
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, /);
    // The headers that must be covered, or the request is repudiable.
    expect(auth).toMatch(/SignedHeaders=[^,]*host/);
    expect(auth).toMatch(/SignedHeaders=[^,]*x-amz-content-sha256/);
    expect(auth).toMatch(/SignedHeaders=[^,]*x-amz-date/);
    expect(auth).toMatch(/Signature=[0-9a-f]{64}$/);
  });
});
