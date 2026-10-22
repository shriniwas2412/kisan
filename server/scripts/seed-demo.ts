// npm run seed:demo  ->  adds the demo accounts to the local database (server/.local.sqlite).
// Emails and the password come from .dev.vars (git-ignored); see .dev.vars.example.
import { sqliteD1 } from "../src/lib/sqlite-d1.ts";
import { seedDemo } from "../src/seedDemo.ts";

const file = new URL("../.local.sqlite", import.meta.url).pathname;
const DB = sqliteD1(file, new URL("../migrations/", import.meta.url));
const { JWT_SECRET, DEMO_ADMIN_EMAIL, DEMO_WORKER_EMAIL, DEMO_PASSWORD } = process.env;
if (!JWT_SECRET || !DEMO_ADMIN_EMAIL || !DEMO_WORKER_EMAIL || !DEMO_PASSWORD) {
  console.error("Set JWT_SECRET, DEMO_ADMIN_EMAIL, DEMO_WORKER_EMAIL and DEMO_PASSWORD in server/.dev.vars first.");
  process.exit(1);
}
for (const line of await seedDemo({ DB, JWT_SECRET, COOKIE_INSECURE: "1" }, { adminEmail: DEMO_ADMIN_EMAIL, workerEmail: DEMO_WORKER_EMAIL, password: DEMO_PASSWORD })) {
  console.log(line);
}
