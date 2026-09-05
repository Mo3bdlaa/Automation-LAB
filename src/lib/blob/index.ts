/**
 * Blob store for rendered documents. Local filesystem in development; the
 * S3-compatible implementation slots in beside it (same interface) when the
 * Vercel project gets a bucket. Keys look like
 *   tenants/<tenantId>/documents/<documentId>/L1.pdf
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

let store: BlobStore | null = null;

export function blobStore(): BlobStore {
  if (store) return store;
  const which = process.env.BLOB_STORE ?? "local";
  switch (which) {
    case "local":
      store = createLocalBlobStore(process.env.BLOB_LOCAL_DIR ?? path.join(process.cwd(), ".data", "blobs"));
      return store;
    default:
      throw new Error(`Unknown BLOB_STORE "${which}". Implemented: local. (S3 lands with the Vercel project.)`);
  }
}

export function documentBlobKey(tenantId: string, documentId: string, level: number, ext = "pdf"): string {
  return `tenants/${tenantId}/documents/${documentId}/L${level}.${ext}`;
}
