// Create an admin account. There is no open sign-up, so this is how the first admin is made.
//   ADMIN_NAME=.. ADMIN_EMAIL=.. ADMIN_PASSWORD=.. npm run create-admin           -> local .local.sqlite
//   ADMIN_NAME=.. ADMIN_EMAIL=.. ADMIN_PASSWORD=.. npm run create-admin -- --sql  -> prints one INSERT for
//   `wrangler d1 execute kisan --remote --command "<sql>"` (the password itself is never printed, only its hash)
import { sqliteD1 } from "../src/lib/sqlite-d1.ts";
import { adminSql, createAdmin } from "../src/admin.ts";

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters).");
  process.exit(1);
}
const a = { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
if (process.argv.includes("--sql")) {
  console.log(await adminSql(a));
} else {
  const file = new URL("../.local.sqlite", import.meta.url).pathname;
  const DB = sqliteD1(file, new URL("../migrations/", import.meta.url));
  console.log("created", (await createAdmin({ DB }, a)).email);
}
