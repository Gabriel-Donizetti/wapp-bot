import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import type { PoolClient } from "pg";
import { createPool } from "./database/pool.js";
import { migrate } from "./database/migrate.js";
import { readConfig } from "./config/env.js";
import { AuthService } from "./modules/auth/auth-service.js";
import { UserRepository } from "./modules/auth/user-repository.js";
import { Sessions, clientFactory } from "./modules/sessions/session-service.js";
import { SessionRepository } from "./modules/sessions/session-repository.js";
import { Scheduler } from "./modules/schedules/scheduler.js";
import { ScheduleRepository } from "./modules/schedules/schedule-repository.js";
import { MessageRepository } from "./modules/messages/message-repository.js";
import { MessageService } from "./modules/messages/message-service.js";
import { buildApp } from "./app.js";

const config = readConfig();
const log = pino();
const pool = createPool(config.DATABASE_URL);
mkdirSync(config.DATA_DIR, { recursive: true, mode: 0o700 });
const auth = new AuthService(
  new UserRepository(pool),
  config.JWT_SECRET,
  config.JWT_TTL_SECONDS,
);
const sessionRepository = new SessionRepository(pool);
const schedules = new ScheduleRepository(pool);
const messages = new MessageRepository(pool);
const authPath = join(config.DATA_DIR, "auth");
const sessions = new Sessions(
  sessionRepository,
  clientFactory(authPath),
  authPath,
  (error, sessionId) =>
    log.error({ err: error, sessionId }, "Falha na sessão WhatsApp"),
);
const scheduler = new Scheduler(schedules, sessions);
const app = buildApp({
  pool,
  auth,
  sessions,
  sessionRepository,
  schedules,
  messages: new MessageService(messages, sessions),
  origins: config.origins,
  logging: true,
  trustProxy: config.TRUST_PROXY === "true",
});
let server: ReturnType<typeof app.listen> | undefined;
let lease: PoolClient | undefined;
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  const drain = server
    ? new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      )
    : Promise.resolve();
  await scheduler.stop();
  await drain;
  await sessions.close();
  if (lease) {
    await lease.query(
      "SELECT pg_advisory_unlock(hashtext(current_schema()),93477002)",
    );
    lease.release();
  }
  await pool.end();
};
process.on("SIGINT", () => {
  void shutdown().catch((error) => {
    log.error(error);
    process.exitCode = 1;
  });
});
process.on("SIGTERM", () => {
  void shutdown().catch((error) => {
    log.error(error);
    process.exitCode = 1;
  });
});
try {
  await migrate(pool);
  lease = await pool.connect();
  if (
    !(
      await lease.query(
        "SELECT pg_try_advisory_lock(hashtext(current_schema()),93477002) AS locked",
      )
    ).rows[0].locked
  ) {
    throw new Error(
      "Outra instância da API já está ativa neste banco. Execute apenas um worker de sessões.",
    );
  }
  await auth.bootstrap(
    config.BOOTSTRAP_ADMIN_USERNAME,
    config.BOOTSTRAP_ADMIN_PASSWORD,
  );
  await messages.recoverInterrupted();
  await scheduler.start(config.SCHEDULER_INTERVAL_MS, (error) =>
    log.error({ err: error }, "Falha no agendador"),
  );
  server = app.listen(config.PORT, config.HOST);
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });
  log.info({ host: config.HOST, port: config.PORT }, "Wapp API disponível");
  for (const record of await sessionRepository.list())
    void sessions
      .start(record.id)
      .catch((error) =>
        log.error(
          { err: error, sessionId: record.id },
          "Falha ao restaurar sessão",
        ),
      );
} catch (error) {
  log.error(error);
  await shutdown();
  process.exitCode = 1;
}
