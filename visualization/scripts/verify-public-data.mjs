import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const database = resolve("public/data.sqlite");

if (!existsSync(database) || statSync(database).size === 0) {
  console.error("Missing public/data.sqlite. Run: python Scripts/export_sqlserver_to_sqlite.py");
  process.exit(1);
}
