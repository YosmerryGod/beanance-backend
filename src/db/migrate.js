import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentDir, "migrations");

export function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    database.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name)
  );

  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of migrationFiles) {
    if (applied.has(name)) continue;

    const sql = readFileSync(join(migrationsDir, name), "utf8");
    const apply = database.transaction(() => {
      database.exec(sql);
      database.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
    });

    apply();
  }
}
