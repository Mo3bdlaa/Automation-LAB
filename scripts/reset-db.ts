/** Development only: drop every table so migrations can be re-applied from scratch. */
import { pool } from "../src/db/client";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
  await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;`);
  console.log("Database reset. Run `pnpm db:migrate && pnpm db:seed`.");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
