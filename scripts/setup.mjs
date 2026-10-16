import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const path = join(root, ".env");
if (existsSync(path)) {
  console.log(".env já existe; configuração preservada.");
  process.exit(0);
}
const values = {
  POSTGRES_DB: "wapp",
  POSTGRES_USER: "wapp",
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  JWT_SECRET: randomBytes(48).toString("hex"),
  BOOTSTRAP_ADMIN_USERNAME: "admin",
  BOOTSTRAP_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
};
let content = readFileSync(join(root, ".env.example"), "utf8");
for (const [key, value] of Object.entries(values))
  content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
content = content
  .replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL=postgresql://wapp:${values.POSTGRES_PASSWORD}@127.0.0.1:5432/wapp`,
  )
  .replace(
    /^TEST_DATABASE_URL=.*$/m,
    `TEST_DATABASE_URL=postgresql://wapp:${values.POSTGRES_PASSWORD}@127.0.0.1:5432/wapp_test`,
  );
writeFileSync(path, content, { mode: 0o600 });
mkdirSync(join(root, "data"), { recursive: true, mode: 0o700 });
writeFileSync(
  join(root, "data/initial-admin.txt"),
  `Usuário: admin\nSenha: ${values.BOOTSTRAP_ADMIN_PASSWORD}\nTroque a senha no painel após o primeiro acesso.\n`,
  { mode: 0o600 },
);
console.log(
  "Configuração gerada. Consulte data/initial-admin.txt para o primeiro acesso. Nenhum segredo foi exibido.",
);
