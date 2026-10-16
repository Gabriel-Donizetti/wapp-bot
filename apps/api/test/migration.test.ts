import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { importSqlite } from "../src/database/import-sqlite.js";
import { migrate } from "../src/database/migrate.js";
import { fixture } from "./helpers.js";
test("migração SQLite preserva origem, cria backup e importa uma única vez com interrupções marcadas unknown", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const path = join(f.dir, "legacy.sqlite");
  const db = new DatabaseSync(path);
  const id = randomUUID();
  db.exec(
    'CREATE TABLE sessions(id TEXT,name TEXT,createdAt TEXT); CREATE TABLE schedules(id TEXT,sessionId TEXT,"to" TEXT,text TEXT,sendAt TEXT,status TEXT,createdAt TEXT,sentAt TEXT,messageId TEXT,error TEXT)',
  );
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    "legacy",
    "Legado",
    "2026-01-01T12:00:00Z",
  );
  db.prepare("INSERT INTO schedules VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    id,
    "legacy",
    "5511888888888",
    "Lembrete",
    "2099-01-01T12:00:00Z",
    "sending",
    "2026-01-01T12:00:00Z",
    null,
    null,
    null,
  );
  db.close();
  await migrate(f.pool);
  assert.deepEqual(await importSqlite(f.pool, path), {
    imported: true,
    sessions: 1,
    schedules: 1,
  });
  assert.equal((await f.sessionRepository.get("legacy")).name, "Legado");
  assert.equal((await f.schedules.get(id)).status, "unknown");
  assert.equal((await importSqlite(f.pool, path)).imported, false);
  assert.ok(existsSync(path));
  assert.ok(
    readdirSync(join(f.dir, "backups")).some((name) =>
      name.endsWith(".sqlite"),
    ),
  );
  const original = new DatabaseSync(path, { readOnly: true });
  assert.equal(
    original.prepare("SELECT status FROM schedules").get()?.status,
    "sending",
  );
  original.close();
});
