import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.argv[2] ?? "start";
if (!["start", "stop", "status"].includes(command))
  throw new Error("Use start, stop ou status.");
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("db:local aceita somente um PostgreSQL local.");
const data = resolve(root, "data/local-postgres");
const bundled = join(data, "runtime/usr/lib/postgresql/16/bin");
const configured = spawnSync("pg_config", ["--bindir"], {
  encoding: "utf8",
}).stdout?.trim();
const bin =
  process.env.LOCAL_POSTGRES_BIN ||
  (existsSync(join(bundled, "pg_ctl")) ? bundled : configured);
if (!bin || !existsSync(join(bin, "pg_ctl")))
  throw new Error(
    "Instale PostgreSQL 16+ no host ou configure LOCAL_POSTGRES_BIN com a pasta de pg_ctl/initdb.",
  );
const cluster = join(data, "cluster");
const socket = join(data, "socket");
const run = (name, args) =>
  spawnSync(join(bin, name), args, { stdio: "inherit" }).status ?? 1;
if (command !== "start") {
  process.exitCode = run("pg_ctl", [
    "-D",
    cluster,
    ...(command === "stop" ? ["-m", "fast", "-w", "stop"] : ["status"]),
  ]);
} else {
  mkdirSync(socket, { recursive: true, mode: 0o700 });
  if (!existsSync(join(cluster, "PG_VERSION"))) {
    const passwordFile = join(data, "init-password");
    writeFileSync(passwordFile, decodeURIComponent(url.password) + "\n", {
      mode: 0o600,
    });
    try {
      const args = [
        "-D",
        cluster,
        "--username=" + decodeURIComponent(url.username),
        "--pwfile=" + passwordFile,
        "--auth-host=scram-sha-256",
        "--auth-local=trust",
        "--locale=C.UTF-8",
      ];
      const share = resolve(bin, "../../../../share/postgresql/16");
      if (existsSync(join(share, "postgres.bki"))) args.push("-L", share);
      if (run("initdb", args))
        throw new Error("Falha ao inicializar o PostgreSQL local.");
    } finally {
      unlinkSync(passwordFile);
    }
  }
  const running =
    spawnSync(join(bin, "pg_ctl"), ["-D", cluster, "status"], {
      stdio: "ignore",
    }).status === 0;
  if (
    !running &&
    run("pg_ctl", [
      "-D",
      cluster,
      "-l",
      join(data, "server.log"),
      "-o",
      // O cluster de desenvolvimento roda com um usuário comum. Evita perder
      // segmentos POSIX se o sistema limpar IPC ao encerrar uma sessão de login.
      `-h 127.0.0.1 -p ${url.port || "5432"} -k '${socket.replaceAll("'", "'\\''")}' -c dynamic_shared_memory_type=mmap`,
      "-w",
      "start",
    ])
  )
    throw new Error(
      "Falha ao iniciar. Confira data/local-postgres/server.log e a porta configurada.",
    );
  const controlUrl = new URL(url);
  controlUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: controlUrl.toString() });
  await client.connect();
  try {
    const names = [decodeURIComponent(url.pathname.slice(1))];
    if (process.env.TEST_DATABASE_URL) {
      const testUrl = new URL(process.env.TEST_DATABASE_URL);
      if (testUrl.hostname === url.hostname && testUrl.port === url.port)
        names.push(decodeURIComponent(testUrl.pathname.slice(1)));
    }
    for (const name of new Set(names)) {
      if (!name) throw new Error("Informe o nome do banco na URL.");
      if (
        !(
          await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [
            name,
          ])
        ).rowCount
      )
        await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
    }
    console.log(
      "PostgreSQL local disponível. Dados em data/local-postgres/cluster.",
    );
  } finally {
    await client.end();
  }
}
