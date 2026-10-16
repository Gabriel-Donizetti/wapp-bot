import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { SignJWT } from "jose";
import { fixture, testPassword, testSecret } from "./helpers.js";

test("JWT protege rotas, login não expõe hash, logout revoga e senhas inválidas são recusadas", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  assert.equal((await f.call("get", "/sessions", undefined, null)).status, 401);
  assert.equal(
    (
      await f.call(
        "post",
        "/auth/login",
        { username: "admin", password: "incorreta" },
        null,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await f.call(
        "post",
        "/auth/login",
        { username: "missing", password: testPassword },
        null,
      )
    ).status,
    401,
  );
  const login = await f.call(
    "post",
    "/auth/login",
    { username: "admin", password: testPassword },
    null,
  );
  assert.equal(login.status, 200);
  assert.ok(login.body.accessToken);
  assert.equal(login.body.user.passwordHash, undefined);
  assert.equal((await f.call("get", "/auth/me")).body.username, "admin");
  assert.equal(
    (await f.call("get", "/sessions", undefined, "bad-token")).status,
    401,
  );
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(f.user.id)
    .setJti(crypto.randomUUID())
    .setIssuer("wapp")
    .setAudience("wapp-api")
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
    .sign(new TextEncoder().encode(testSecret));
  assert.equal(
    (await f.call("get", "/sessions", undefined, expired)).status,
    401,
  );
  assert.equal((await f.call("post", "/auth/logout")).status, 204);
  assert.equal((await f.call("get", "/auth/me")).status, 401);
});

test("usuários operadores não gerenciam usuários; troca de senha revoga tokens existentes", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const create = await f.call("post", "/auth/users", {
    username: "integration",
    name: "Integração",
    password: testPassword,
    role: "operator",
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.passwordHash, undefined);
  const token = (
    await f.call(
      "post",
      "/auth/login",
      { username: "integration", password: testPassword },
      null,
    )
  ).body.accessToken;
  assert.equal(
    (await f.call("get", "/sessions", undefined, token)).status,
    200,
  );
  assert.equal(
    (await f.call("get", "/auth/users", undefined, token)).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        "post",
        "/auth/users",
        { username: "another", name: "Outra", password: testPassword },
        token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call("post", "/auth/change-password", {
        currentPassword: "errada",
        newPassword: "New-test-password-123",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call("post", "/auth/change-password", {
        currentPassword: testPassword,
        newPassword: "New-test-password-123",
      })
    ).status,
    204,
  );
  assert.equal((await f.call("get", "/sessions")).status, 401);
  assert.equal(
    (
      await f.call(
        "post",
        "/auth/login",
        { username: "admin", password: "New-test-password-123" },
        null,
      )
    ).status,
    200,
  );
});

test("limite de tentativas de login e respostas consistentes sem stack trace", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await f.call(
          "post",
          "/auth/login",
          { username: "admin", password: "errada" },
          null,
        )
      ).status,
      401,
    );
  const response = await f.call(
    "post",
    "/auth/login",
    { username: "admin", password: "errada" },
    null,
  );
  assert.equal(response.status, 429);
  const invalid = await f.call("post", "/sessions", {
    id: "../escape",
    name: "Nome",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "VALIDATION_ERROR");
  assert.ok(invalid.body.requestId);
  assert.equal(invalid.body.stack, undefined);
  assert.equal(
    (await request(f.app).get("/health")).body.database,
    "postgresql",
  );
  assert.equal(
    (await request(f.app).get("/openapi.json")).body.openapi,
    "3.0.3",
  );
  assert.equal((await request(f.app).get("/docs/")).status, 200);
});

test("sessões isoladas: cadastro, conflitos, QR, desconexão, reconexão e exclusão", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  assert.equal(
    (await f.call("post", "/sessions", { id: "comercial", name: "Comercial" }))
      .status,
    201,
  );
  assert.equal(
    (await f.call("post", "/sessions", { id: "suporte", name: "Suporte" }))
      .status,
    201,
  );
  assert.equal(
    (await f.call("post", "/sessions", { id: "comercial", name: "Duplicada" }))
      .status,
    409,
  );
  const client = f.clients.get("comercial")!;
  client.emit("qr", "test-qr");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.match(
    (await f.call("get", "/sessions/comercial/qr")).body.qr,
    /^data:image\/png;base64,/,
  );
  client.emit("ready");
  assert.equal(
    (await f.call("get", "/sessions/comercial")).body.status,
    "ready",
  );
  assert.equal(
    (await f.call("get", "/sessions/suporte")).body.status,
    "starting",
  );
  assert.equal(
    (await f.call("post", "/sessions/comercial/disconnect")).body.status,
    "disconnected",
  );
  assert.ok(client.destroyed);
  assert.equal(
    (await f.call("post", "/sessions/comercial/connect")).body.status,
    "starting",
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await f.call("delete", "/sessions/comercial")).status, 204);
  assert.equal((await f.call("get", "/sessions/comercial")).status, 404);
  assert.equal(
    (
      await f.call("post", "/sessions", {
        id: "comercial",
        name: "Reutilizada",
      })
    ).status,
    409,
  );
});

test("agenda contém apenas contatos salvos únicos, preserva homônimos e pesquisa grupos sem acentos", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  client.contacts.push(
    { ...client.contacts[0]!, number: "9999999999999" },
    {
      id: { _serialized: "5511666666666@c.us", server: "c.us" },
      number: "5511666666666",
      name: "Cliente",
      isUser: true,
      isMyContact: true,
    },
  );
  client.groupName = "Operações São Paulo";
  const result = await f.call("get", "/sessions/comercial/directory");
  assert.equal(result.status, 200);
  assert.equal(result.body.contacts.length, 3);
  assert.equal(
    new Set(result.body.contacts.map((item: { id: string }) => item.id)).size,
    3,
  );
  assert.equal(
    result.body.contacts.filter(
      (item: { name: string }) => item.name === "Cliente",
    ).length,
    2,
  );
  assert.equal(
    result.body.contacts.find(
      (item: { id: string }) => item.id === "5511888888888@c.us",
    ).number,
    "5511888888888",
  );
  const groups = await f.call(
    "get",
    "/sessions/comercial/groups?search=OPERACOES%20SAO&limit=1",
  );
  assert.equal(groups.body.total, 1);
  assert.equal(groups.body.data[0].id, "120363000000@g.us");
  assert.equal(
    (
      await f.call(
        "get",
        "/sessions/comercial/contacts?search=Cliente&limit=1&offset=1",
      )
    ).body.data.length,
    1,
  );
  client.contactsError = true;
  const partial = await f.call("get", "/sessions/comercial/directory");
  assert.equal(partial.status, 200);
  assert.equal(partial.body.groups.length, 1);
  assert.equal(partial.body.warnings[0].source, "contacts");
  assert.equal(
    (await f.call("get", "/sessions/comercial/contacts")).status,
    502,
  );
  client.groupsError = true;
  assert.equal(
    (await f.call("get", "/sessions/comercial/directory")).status,
    502,
  );
});

test("envio de texto persiste histórico; idempotência impede duplicação e detecta alteração do payload", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const input = {
    sessionId: "comercial",
    to: "+5511888888888",
    text: "Mensagem de teste",
  };
  const headers = { "Idempotency-Key": "operation-123" };
  const response = await f.call("post", "/messages", input, f.token, headers);
  assert.equal(response.status, 201);
  assert.equal(response.body.status, "sent");
  assert.equal(
    (await f.call("post", "/messages", input, f.token, headers)).body.id,
    response.body.id,
  );
  assert.equal(client.sent.length, 1);
  assert.equal(
    (
      await f.call(
        "post",
        "/messages",
        { ...input, text: "Outra" },
        f.token,
        headers,
      )
    ).status,
    409,
  );
  assert.equal(
    (await f.call("post", "/messages", { ...input, to: "120363000000@g.us" }))
      .status,
    201,
  );
  assert.equal(
    (await f.call("get", `/messages/${response.body.id}`)).body.messageId,
    "message-1",
  );
  assert.equal((await f.call("get", "/messages?status=sent")).body.total, 2);
  assert.equal(
    (await f.call("post", "/messages", { ...input, text: " " })).status,
    400,
  );
  assert.equal(
    (await f.call("post", "/messages", { ...input, media: "photo" })).status,
    400,
  );
  client.sendError = true;
  const uncertain = await f.call("post", "/messages", input);
  assert.equal(uncertain.status, 502);
  assert.ok(uncertain.body.details.messageRecordId);
  assert.equal(
    (await f.call("get", `/messages/${uncertain.body.details.messageRecordId}`))
      .body.status,
    "unknown",
  );
});

test("corrida de requisições com mesma chave gera um único envio", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const input = {
    sessionId: "comercial",
    to: "5511888888888",
    text: "Uma vez",
  };
  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.call("post", "/messages", input, f.token, {
        "Idempotency-Key": "concurrent",
      }),
    ),
  );
  assert.equal(new Set(responses.map((item) => item.body.id)).size, 1);
  assert.equal(client.sent.length, 1);
  assert.equal((await f.call("get", "/messages")).body.total, 1);
});

test("agendamentos validam fuso e data futura, consultam, paginam e cancelam; remover sessão preserva histórico", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  const input = {
    sessionId: "comercial",
    to: "5511888888888",
    text: "Lembrete",
    sendAt: new Date(Date.now() + 3600000).toISOString(),
  };
  for (const sendAt of ["2020-01-01T10:00:00Z", "2099-01-01T10:00:00", "bad"])
    assert.equal(
      (await f.call("post", "/schedules", { ...input, sendAt })).status,
      400,
    );
  const first = await f.call("post", "/schedules", input);
  assert.equal(first.status, 201);
  assert.equal(
    (await f.call("get", `/schedules/${first.body.id}`)).body.text,
    "Lembrete",
  );
  assert.equal(
    (await f.call("get", "/schedules?status=pending&limit=1")).body.total,
    1,
  );
  assert.equal(
    (await f.call("post", `/schedules/${first.body.id}/cancel`)).body.status,
    "cancelled",
  );
  assert.equal(
    (await f.call("post", `/schedules/${first.body.id}/cancel`)).status,
    409,
  );
  const second = await f.call("post", "/schedules", input);
  assert.equal((await f.call("delete", "/sessions/comercial")).status, 204);
  assert.equal(
    (await f.call("get", `/schedules/${second.body.id}`)).body.status,
    "cancelled",
  );
});

test("falha de persistência após envio preserva idempotência e resultado incerto", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const finish = f.messageRepository.finish.bind(f.messageRepository);
  f.messageRepository.finish = async (...args) => {
    if (args[1] === "sent") throw new Error("Falha ao persistir envio");
    return finish(...args);
  };
  const input = {
    sessionId: "comercial",
    to: "5511888888888",
    text: "Uma vez apesar de falha de banco",
  };
  const headers = { "Idempotency-Key": "database-failure" };
  assert.equal(
    (await f.call("post", "/messages", input, f.token, headers)).status,
    500,
  );
  const retry = await f.call("post", "/messages", input, f.token, headers);
  assert.equal(retry.status, 202);
  assert.equal(retry.body.status, "sending");
  assert.equal(client.sent.length, 1);
  await f.messageRepository.recoverInterrupted();
  assert.equal(
    (await f.call("get", `/messages/${retry.body.id}`)).body.status,
    "unknown",
  );
});
