import { pool } from "../src/db/client";
import { seedSharedCorpus } from "../src/lib/corpus/persist";

async function main() {
  const force = process.argv.includes("--force");
  const report = await seedSharedCorpus({ force, log: (m) => console.log(m) });
  if (!report.skipped) console.table(report.counts);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
