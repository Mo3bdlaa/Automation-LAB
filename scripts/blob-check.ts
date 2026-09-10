/**
 * Prove the configured blob store actually works, against the real thing.
 *
 * The unit tests exercise the S3 client against a stand-in server, which cannot
 * prove that AWS or R2 accept the signature. This does: it writes an object,
 * reads it back, checks the bytes, and deletes it. Run it once after setting
 * the bucket up and before any event.
 *
 *   pnpm blob:check
 */
import { blobStore } from "../src/lib/blob";

async function main() {
  const store = blobStore();
  const key = `healthcheck/${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
  const payload = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
  console.log(`store: ${store.id}`);

  const { size } = await store.put(key, payload, "application/octet-stream");
  console.log(`  put ${key} (${size} bytes)`);

  const read = await store.get(key);
  if (!read) throw new Error("wrote an object and read back nothing");
  if (Buffer.compare(Buffer.from(read), Buffer.from(payload)) !== 0) throw new Error("read back different bytes than were written");
  console.log(`  get: ${read.byteLength} bytes, identical`);

  const missing = await store.get(`${key}.does-not-exist`);
  if (missing !== null) throw new Error("a missing object should read as null");
  console.log("  missing object reads as null");

  await store.delete(key);
  if ((await store.get(key)) !== null) throw new Error("deleted object is still readable");
  console.log("  delete: gone");

  console.log("\nBlob store works.");
  process.exit(0);
}
main().catch((e) => {
  console.error("\nBlob store check FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
