/**
 * Blob store for rendered documents. Keys look like
 *   tenants/<tenantId>/documents/<documentId>/L1.pdf
 *
 * Local filesystem in development. In production it has to be object storage:
 * a serverless function has no disk that survives the request, so BLOB_STORE=local
 * on Vercel would appear to work and then serve 404s from a different instance.
 *
 * The S3 implementation is written against the REST API with SigV4 signing
 * rather than the AWS SDK, which is 15 MB of dependency for four verbs. It
 * works against anything S3-compatible: Cloudflare R2, Backblaze B2, MinIO, S3
 * itself. R2 is the cheapest fit here because it charges nothing for egress and
 * this is a site that mostly serves PDFs.
 */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BlobStore {
  readonly id: string;
  put(key: string, data: Uint8Array, mime: string): Promise<{ size: number }>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

function safeKey(key: string): string {
  if (key.includes("..") || key.startsWith("/")) throw new Error(`Unsafe blob key: ${key}`);
  return key;
}

export function createLocalBlobStore(rootDir: string): BlobStore {
  const root = path.resolve(rootDir);
  const full = (k: string) => path.join(root, safeKey(k));
  return {
    id: "local",
    async put(key, data) {
      const f = full(key);
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, data);
      return { size: data.byteLength };
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(full(key)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      await rm(full(key), { force: true });
    },
    async deletePrefix(prefix) {
      const dir = full(prefix);
      try {
        if ((await stat(dir)).isDirectory()) await rm(dir, { recursive: true, force: true });
      } catch {
        /* nothing to delete */
      }
    },
  };
}

/** SigV4, the subset of it these four verbs need. */
async function sign(opts: {
  method: string;
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payload: Uint8Array;
  extraHeaders?: Record<string, string>;
}): Promise<Record<string, string>> {
  const { createHash, createHmac } = await import("node:crypto");
  const hex = (b: Buffer | string) => (typeof b === "string" ? b : b.toString("hex"));
  const sha256 = (d: Uint8Array | string) => createHash("sha256").update(d).digest();
  const hmac = (key: Buffer | string, d: string) => createHmac("sha256", key).update(d).digest();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hex(sha256(opts.payload));

  const headers: Record<string, string> = {
    host: opts.url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(opts.extraHeaders ?? {}),
  };
  const signedHeaders = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${String(headers[h] ?? headers[Object.keys(headers).find((k) => k.toLowerCase() === h)!]).trim()}\n`).join("");
  const canonicalRequest = [
    opts.method,
    opts.url.pathname,
    opts.url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${opts.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hex(sha256(canonicalRequest))].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${opts.secretAccessKey}`, dateStamp), opts.region), "s3"), "aws4_request");
  const signature = hex(hmac(signingKey, stringToSign));

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
  };
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createS3BlobStore(cfg: S3Config): BlobStore {
  const base = cfg.endpoint.replace(/\/$/, "");
  const urlFor = (key: string) => new URL(`${base}/${cfg.bucket}/${safeKey(key)}`);
  const call = async (method: string, url: URL, payload: Uint8Array, extraHeaders?: Record<string, string>) => {
    const headers = await sign({ method, url, payload, region: cfg.region, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, extraHeaders });
    return fetch(url, { method, headers, body: method === "GET" || method === "HEAD" || method === "DELETE" ? undefined : (payload as BodyInit) });
  };

  return {
    id: "s3",
    async put(key, data, mime) {
      const res = await call("PUT", urlFor(key), data, { "content-type": mime });
      if (!res.ok) throw new Error(`Blob put failed: ${res.status} ${await res.text()}`);
      return { size: data.byteLength };
    },
    async get(key) {
      const res = await call("GET", urlFor(key), new Uint8Array());
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Blob get failed: ${res.status} ${await res.text()}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await call("DELETE", urlFor(key), new Uint8Array());
      if (!res.ok && res.status !== 404) throw new Error(`Blob delete failed: ${res.status}`);
    },
    /**
     * Listed then deleted one at a time. Only used for resetting a sandbox,
     * where the prefix holds a handful of objects, so the extra round trips
     * cost less than the batch-delete XML would.
     */
    async deletePrefix(prefix) {
      let token: string | null = null;
      do {
        const url = new URL(`${base}/${cfg.bucket}`);
        url.searchParams.set("list-type", "2");
        url.searchParams.set("prefix", safeKey(prefix));
        if (token) url.searchParams.set("continuation-token", token);
        const res = await call("GET", url, new Uint8Array());
        if (!res.ok) throw new Error(`Blob list failed: ${res.status}`);
        const xml = await res.text();
        for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
          await call("DELETE", new URL(`${base}/${cfg.bucket}/${m[1]}`), new Uint8Array());
        }
        const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        token = xml.includes("<IsTruncated>true</IsTruncated>") && next ? next[1] : null;
      } while (token);
    },
  };
}

let store: BlobStore | null = null;

export function blobStore(): BlobStore {
  if (store) return store;
  const which = process.env.BLOB_STORE ?? "local";
  switch (which) {
    case "local": {
      // A serverless function's disk does not survive the request, so this
      // would look like it worked and then serve 404s from another instance.
      if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_BLOBS_IN_PROD) {
        throw new Error("BLOB_STORE=local cannot work in production: object storage is needed. Set BLOB_STORE=s3, or ALLOW_LOCAL_BLOBS_IN_PROD=1 if this really is a host with a persistent disk.");
      }
      store = createLocalBlobStore(process.env.BLOB_LOCAL_DIR ?? path.join(process.cwd(), ".data", "blobs"));
      return store;
    }
    case "s3": {
      const need = (name: string) => {
        const v = process.env[name];
        if (!v) throw new Error(`BLOB_STORE=s3 needs ${name}.`);
        return v;
      };
      store = createS3BlobStore({
        endpoint: need("S3_ENDPOINT"),
        bucket: need("S3_BUCKET"),
        region: process.env.S3_REGION ?? "auto",
        accessKeyId: need("S3_ACCESS_KEY_ID"),
        secretAccessKey: need("S3_SECRET_ACCESS_KEY"),
      });
      return store;
    }
    default:
      throw new Error(`Unknown BLOB_STORE "${which}". Implemented: local, s3.`);
  }
}

export function documentBlobKey(tenantId: string, documentId: string, level: number, ext = "pdf"): string {
  return `tenants/${tenantId}/documents/${documentId}/L${level}.${ext}`;
}
