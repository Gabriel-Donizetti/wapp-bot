import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture } from "./helpers.js";
import { Scheduler } from "../src/modules/schedules/scheduler.js";

const input = {
  sessionId: "comercial",
  to: "120363000000@g.us",
  text: "Mensagem para o grupo",
};
const read = (id: unknown, t = 1792400000) => ({ id, t });

test("grupo: consulta leitores por sessão, resolve nome/perfil e preserva IDs sem nome", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const other = await f.add("outra");
  const sent = await f.call("post", "/messages", input);
  client.messageInfo = {
    read: [
      read({ _serialized: "5511888888888@c.us" }),
      read({ $1: "123456789@lid" }),
      read("5511666666666@c.us", 0),
      read({ user: "5511888888888", server: "c.us" }, 1792400001),
    ],
  };
  other.messageInfo = { read: [read("5511000000000@c.us")] };
  const path = `/messages/${sent.body.id}/read-receipts`;
  const result = await f.call("get", path);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.sessionId, "comercial");
  assert.equal(result.body.groupId, input.to);
  assert.equal(result.body.totalReaders, 3);
  assert.deepEqual(
    result.body.readers.find((r: { name: string }) => r.name === "Cliente"),
    {
      id: "5511888888888@c.us",
      name: "Cliente",
      readAt: new Date(1792400000 * 1000).toISOString(),
    },
  );
  assert.ok(
    result.body.readers.some(
      (r: { name: string }) => r.name === "Contato privado",
    ),
  );
  assert.deepEqual(
    result.body.readers.find((r: { name: string | null }) => r.name === null),
    {
      id: "5511666666666@c.us",
      name: null,
      readAt: null,
    },
  );
  assert.equal(other.infoRequests.length, 0);
  assert.equal(client.sent.length, 1);
  assert.equal((await f.call("get", path, undefined, null)).status, 401);
  assert.equal(
    (await f.call("get", "/messages/invalido/read-receipts")).status,
    400,
  );
});

test("grupo: contato indisponível mantém leitura; falha ou dados ausentes não viram zero leitores", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const sent = await f.call("post", "/messages", input);
  const path = `/messages/${sent.body.id}/read-receipts`;
  client.messageInfo = { read: [read("123456789@lid")] };
  client.contactError = true;
  const withoutName = await f.call("get", path);
  assert.equal(withoutName.status, 200);
  assert.equal(withoutName.body.totalReaders, 1);
  assert.equal(withoutName.body.readers[0].name, null);
  for (const info of [null, {}, { read: null }, { read: [read({})] }]) {
    client.messageInfo = info;
    const result = await f.call("get", path);
    assert.equal(result.status, 502);
    assert.equal(result.body.error, "GROUP_READERS_UNAVAILABLE");
  }
  client.messageInfo = { read: [] };
  assert.equal((await f.call("get", path)).body.totalReaders, 0);
  client.messageInfoError = true;
  assert.equal((await f.call("get", path)).status, 502);
  client.messageInfoError = false;
  client.quoteMissing = true;
  assert.equal((await f.call("get", path)).status, 422);
  client.quoteMissing = false;
  const message = client.messageStates.get(sent.body.messageId)!;
  message.fromMe = false;
  assert.equal((await f.call("get", path)).status, 422);
  message.fromMe = true;
  message.id.remote = "outro@g.us";
  assert.equal((await f.call("get", path)).status, 422);
  await f.sessions.disconnect("comercial");
  assert.equal((await f.call("get", path)).body.error, "SESSION_NOT_READY");
});

test("grupo: rejeita conversa individual e envio sem ID antes de consultar WhatsApp", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const direct = await f.call("post", "/messages", {
    ...input,
    to: "5511888888888",
  });
  assert.equal(
    (await f.call("get", `/messages/${direct.body.id}/read-receipts`)).body
      .error,
    "NOT_A_GROUP_MESSAGE",
  );
  const pending = await f.messageRepository.reserve(input, f.user.id);
  assert.equal(
    (await f.call("get", `/messages/${pending.record.id}/read-receipts`)).body
      .error,
    "NO_MESSAGE_RECEIPT",
  );
  assert.equal(client.infoRequests.length, 0);
});

test("grupo: agendamento libera leitores após envio e publica contrato no OpenAPI", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const scheduled = await f.call("post", "/schedules", {
    ...input,
    sendAt: new Date(Date.now() + 60000).toISOString(),
  });
  const path = `/schedules/${scheduled.body.id}/read-receipts`;
  assert.equal((await f.call("get", path)).body.error, "NO_MESSAGE_RECEIPT");
  await f.pool.query(
    "UPDATE schedules SET send_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
    [scheduled.body.id],
  );
  await new Scheduler(f.schedules, f.sessions).tick();
  client.messageInfo = { read: [read("5511888888888@c.us")] };
  const result = await f.call("get", path);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.readers[0].name, "Cliente");
  assert.equal(client.sent.length, 1);
  const spec = (await request(f.app).get("/openapi.json")).body;
  for (const kind of ["messages", "schedules"])
    assert.ok(spec.paths[`/${kind}/{id}/read-receipts`].get);
});
