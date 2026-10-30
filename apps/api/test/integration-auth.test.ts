import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { fixture, testPassword, testSecret } from "./helpers.js";
import { migrate } from "../src/database/migrate.js";

const integration = { type: "integration", name: "Aplicativo de teste" };

test("integração: token autentica a API sem usuário/senha, só hash é persistido e envios têm autoria", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  const response = await f.call("post", "/auth/users", integration);
  assert.equal(response.status, 201);
  const created = response.body;
  assert.equal(created.type, "integration");
  assert.equal(created.role, "operator");
  assert.equal(created.username, null);
  assert.match(created.token, /^wapp_int_[A-Za-z0-9_-]{43}$/);
  const raw = (
    await f.pool.query("SELECT * FROM users WHERE id=$1", [created.id])
  ).rows[0];
  assert.equal(raw.password_hash, null);
  assert.equal(
    raw.api_token_hash,
    createHash("sha256").update(created.token).digest("hex"),
  );
  assert.ok(!JSON.stringify(raw).includes(created.token));
  const listed = await f.call("get", "/auth/users");
  assert.ok(!JSON.stringify(listed.body).includes(created.token));
  assert.equal(
    listed.body.users.find((u: { id: string }) => u.id === created.id)
      .api_token_hash,
    undefined,
  );
  const me = await f.call("get", "/auth/me", undefined, created.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.id, created.id);
  assert.equal(me.body.token, undefined);
  assert.equal(
    (await f.call("get", "/sessions", undefined, created.token)).status,
    200,
  );
  const sent = await f.call(
    "post",
    "/messages",
    { sessionId: "comercial", to: "5511888888888", text: "Via token" },
    created.token,
  );
  assert.equal(sent.status, 201);
  assert.equal(
    (
      await f.pool.query("SELECT requested_by FROM messages WHERE id=$1", [
        sent.body.id,
      ])
    ).rows[0].requested_by,
    created.id,
  );
  // Contas normais existentes continuam usando login e JWT.
  assert.equal((await f.call("get", "/auth/me")).body.type, "user");
  assert.equal(
    (
      await f.call(
        "post",
        "/auth/login",
        { username: "admin", password: testPassword },
        null,
      )
    ).status,
    200,
  );
});

test("integração: contrato rejeita credenciais próprias, perfil admin e acesso à gestão de usuários", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  for (const extra of [
    { username: "app" },
    { password: testPassword },
    { role: "admin" },
    { role: "operator" },
    { token: "escolhido" },
  ])
    assert.equal(
      (await f.call("post", "/auth/users", { ...integration, ...extra }))
        .status,
      400,
    );
  assert.equal(
    (
      await f.call("post", "/auth/users", {
        type: "user",
        name: "Sem credenciais",
      })
    ).status,
    400,
  );
  const created = (await f.call("post", "/auth/users", integration)).body;
  for (const [method, path, body] of [
    ["get", "/auth/users", undefined],
    ["post", "/auth/users", integration],
    ["post", `/auth/users/${created.id}/token`, undefined],
    ["delete", `/auth/users/${created.id}/token`, undefined],
    [
      "post",
      "/auth/change-password",
      { currentPassword: testPassword, newPassword: testPassword },
    ],
  ] as const)
    assert.equal((await f.call(method, path, body, created.token)).status, 403);
  assert.equal(
    (
      await f.call(
        "post",
        "/auth/login",
        { username: "admin", password: created.token },
        null,
      )
    ).status,
    401,
  );
  assert.equal(
    (await f.call("post", `/auth/users/${f.user.id}/token`)).status,
    404,
  );
  assert.equal(
    (await f.call("post", "/auth/users/invalido/token")).status,
    400,
  );
  assert.equal(
    (await f.call("post", `/auth/users/${created.id}/token`, undefined, null))
      .status,
    401,
  );
});

test("integração: regenerar, revogar, desativar e logout invalidam o token imediatamente", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const created = (await f.call("post", "/auth/users", integration)).body;
  const rotated = await f.call("post", `/auth/users/${created.id}/token`);
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.token, created.token);
  assert.equal(
    (await f.call("get", "/sessions", undefined, created.token)).status,
    401,
  );
  assert.equal(
    (await f.call("get", "/sessions", undefined, rotated.body.token)).status,
    200,
  );
  assert.equal(
    (await f.call("delete", `/auth/users/${created.id}/token`)).status,
    204,
  );
  assert.equal(
    (await f.call("get", "/sessions", undefined, rotated.body.token)).status,
    401,
  );
  const revoked = (
    await f.pool.query("SELECT active,api_token_hash FROM users WHERE id=$1", [
      created.id,
    ])
  ).rows[0];
  assert.equal(revoked.active, false);
  assert.equal(revoked.api_token_hash, null);
  const renewed = (await f.call("post", `/auth/users/${created.id}/token`))
    .body;
  assert.equal(renewed.user.active, true);
  assert.equal(
    (await f.call("post", "/auth/logout", undefined, renewed.token)).status,
    204,
  );
  assert.equal(
    (await f.call("get", "/auth/me", undefined, renewed.token)).status,
    401,
  );
  const finalToken = (await f.call("post", `/auth/users/${created.id}/token`))
    .body.token;
  await f.pool.query("UPDATE users SET active=false WHERE id=$1", [created.id]);
  assert.equal(
    (await f.call("get", "/sessions", undefined, finalToken)).status,
    401,
  );
  assert.equal((await f.call("get", "/auth/me")).status, 200);
  for (const invalid of [
    "wapp_int_bad",
    finalToken.slice(0, -1),
    "wapp_int_" + "A".repeat(43),
  ])
    assert.equal(
      (await f.call("get", "/sessions", undefined, invalid)).status,
      401,
    );
});

test("integração: sessão JWT artificial não permite login de conta de integração", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const created = (await f.call("post", "/auth/users", integration)).body;
  const sessionId = await f.auth.users.createLogin(created.id, 3600);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(created.id)
    .setJti(sessionId)
    .setIssuer("wapp")
    .setAudience("wapp-api")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(testSecret));
  assert.equal(
    (await f.call("get", "/sessions", undefined, token)).status,
    401,
  );
  assert.equal(
    (await f.call("delete", `/auth/users/${randomUUID()}/token`)).status,
    404,
  );
});

test("migração 005 preserva usuários, senhas e JWTs anteriores como acessos normais", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const oldHash = (
    await f.pool.query("SELECT password_hash FROM users WHERE id=$1", [
      f.user.id,
    ])
  ).rows[0].password_hash;
  await f.pool
    .query(`ALTER TABLE users DROP COLUMN type, DROP COLUMN api_token_hash;
    ALTER TABLE users ALTER COLUMN username SET NOT NULL, ALTER COLUMN password_hash SET NOT NULL;
    DELETE FROM schema_migrations WHERE version=5`);
  await migrate(f.pool);
  const user = (await f.call("get", "/auth/me")).body;
  assert.equal(user.type, "user");
  assert.equal(user.username, "admin");
  assert.equal(
    (
      await f.pool.query("SELECT password_hash FROM users WHERE id=$1", [
        f.user.id,
      ])
    ).rows[0].password_hash,
    oldHash,
  );
  assert.equal(
    (
      await f.call(
        "post",
        "/auth/login",
        { username: "admin", password: testPassword },
        null,
      )
    ).status,
    200,
  );
  assert.equal((await f.call("post", "/auth/users", integration)).status, 201);
});
