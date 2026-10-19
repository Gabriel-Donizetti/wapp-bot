import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import { Scheduler } from "../src/modules/schedules/scheduler.js";
import { DeliveryRepository } from "../src/modules/messages/delivery-repository.js";
const input = {
  sessionId: "comercial",
  to: "5511888888888",
  text: "Mensagem com acompanhamento",
};

test("sessão com conexão perdida deixa de ser ready e preserva ACKs sem reenviar", async (t) => {
  for (const throws of [false, true]) {
    const f = await fixture();
    t.after(() => f.close());
    const client = await f.add();
    client.resultAck = 2;
    const sent = await f.call("post", "/messages/text", input);
    assert.equal(sent.body.status, "delivered");
    client.connected = false;
    client.connectionError = throws;
    const checked = await f.call(
      "post",
      `/messages/${sent.body.id}/refresh-status`,
    );
    assert.equal(checked.status, 409);
    assert.equal(checked.body.error, "SESSION_NOT_READY");
    assert.equal(
      (await f.messageRepository.get(sent.body.id)).status,
      "delivered",
    );
    assert.equal(
      (await f.call("get", "/sessions/comercial")).body.status,
      "error",
    );
    assert.match(
      (await f.call("get", "/sessions")).body.sessions[0].error,
      /Reconecte/,
    );
    const blocked = await f.call("post", "/messages/text", input);
    assert.equal(blocked.status, 409);
    assert.equal(client.sent.length, 1);
    const reconnect = await f.call("post", "/sessions/comercial/connect");
    assert.equal(reconnect.status, 200);
    assert.equal(client.destroyed, true);
    const recovered = f.clients.get("comercial")!;
    recovered.emit("ready");
    assert.equal(
      (await f.call("get", "/sessions/comercial")).body.status,
      "ready",
    );
  }
});

test("listagem detecta conexão perdida antes de outra consulta ou envio", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  client.connected = false;
  assert.equal(
    (await f.call("get", "/sessions")).body.sessions[0].status,
    "error",
  );
  assert.equal(f.sessions.isReady("comercial"), false);
});

test("ID sem ACK fica submitted; confirmações progridem e não regridem com eventos atrasados", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  client.resultAck = 0;
  const sent = await f.call("post", "/messages", input, f.token, {
    "Idempotency-Key": "receipt-1",
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.status, "submitted");
  assert.equal(sent.body.ack, 0);
  assert.equal(sent.body.sentAt, null);
  assert.ok(sent.body.submittedAt);
  const id = sent.body.id;
  const waId = sent.body.messageId;
  for (const [ack, status, field] of [
    [1, "sent", "sentAt"],
    [2, "delivered", "deliveredAt"],
    [3, "read", "readAt"],
    [4, "played", "playedAt"],
  ] as const) {
    client.emit(
      "message_ack",
      { fromMe: true, id: { _serialized: waId } },
      ack,
    );
    await f.sessions.flushReceipts();
    const current = await f.call("get", `/messages/${id}`);
    assert.equal(current.body.status, status);
    assert.equal(current.body.ack, ack);
    assert.ok(current.body[field]);
    assert.equal(
      (await f.call("get", `/messages?status=${status}`)).body.total,
      1,
    );
  }
  const before = await f.messageRepository.get(id);
  for (const ack of [1, 0, -1, 2, 4])
    client.emit(
      "message_ack",
      { fromMe: true, id: { _serialized: waId } },
      ack,
    );
  await f.sessions.flushReceipts();
  const after = await f.messageRepository.get(id);
  assert.equal(after.status, "played");
  assert.equal(after.readAt, before.readAt);
  assert.equal(after.sentAt, before.sentAt);
  assert.equal(
    (
      await f.call("post", "/messages", input, f.token, {
        "Idempotency-Key": "receipt-1",
      })
    ).body.status,
    "played",
  );
  assert.equal(client.sent.length, 1);
});

test("ACK anterior ao registro e reinício do repositório preservam a confirmação mais avançada", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  client.resultAck = 0;
  client.earlyAck = 3;
  const sent = await f.call("post", "/messages", input);
  await f.sessions.flushReceipts();
  const saved = await f.messageRepository.get(sent.body.id);
  assert.equal(saved.status, "read");
  assert.equal(saved.ack, 3);
  const reopened = new DeliveryRepository(f.pool);
  await reopened.observe({
    sessionId: "comercial",
    messageId: sent.body.messageId,
    ack: 1,
  });
  assert.equal((await f.messageRepository.get(saved.id)).status, "read");
});

test("reconciliação consulta WhatsApp após reconectar e nunca reenvia", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  client.resultAck = 0;
  const sent = await f.call("post", "/messages", input);
  const id = sent.body.id;
  const waId = sent.body.messageId;
  client.messageStates.get(waId)!.ack = 2;
  client.emit("disconnected");
  await f.monitor.tick();
  assert.equal((await f.messageRepository.get(id)).status, "submitted");
  client.emit("ready");
  await Promise.all([f.monitor.tick(), f.monitor.tick()]);
  assert.equal((await f.messageRepository.get(id)).status, "delivered");
  assert.ok((await f.messageRepository.get(id)).lastCheckedAt);
  client.messageStates.get(waId)!.ack = 3;
  const checked = await f.call("post", `/messages/${id}/refresh-status`);
  assert.equal(checked.status, 200);
  assert.equal(checked.body.status, "read");
  assert.equal(client.sent.length, 1);
  client.quoteMissing = true;
  assert.equal(
    (await f.call("post", `/messages/${id}/refresh-status`)).status,
    422,
  );
  assert.equal((await f.messageRepository.get(id)).status, "read");
});

test("ACK_ERROR registra falha explícita; não transforma entrega comprovada em falha", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  client.resultAck = -1;
  const result = await f.call("post", "/messages", input);
  const id = result.body.id;
  assert.equal(result.body.status, "failed");
  assert.match(result.body.error, /WhatsApp informou falha/);
  await f.receipts.observe({
    sessionId: "comercial",
    messageId: result.body.messageId,
    ack: 0,
  });
  assert.equal((await f.messageRepository.get(id)).status, "failed");
  await f.receipts.observe({
    sessionId: "comercial",
    messageId: result.body.messageId,
    ack: 1,
  });
  assert.equal((await f.messageRepository.get(id)).status, "sent");
  await f.receipts.observe({
    sessionId: "comercial",
    messageId: result.body.messageId,
    ack: -1,
  });
  assert.equal((await f.messageRepository.get(id)).status, "sent");
  await f.receipts.observe({
    sessionId: "comercial",
    messageId: result.body.messageId,
    ack: 2,
  });
  await f.receipts.observe({
    sessionId: "comercial",
    messageId: result.body.messageId,
    ack: -1,
  });
  assert.equal((await f.messageRepository.get(id)).status, "delivered");
});

test("agendamentos também acompanham entrega e leitura sem executar outra vez", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  client.resultAck = null;
  const item = await f.schedules.create({
    ...input,
    sendAt: "2020-01-01T12:00:00Z",
  });
  const scheduler = new Scheduler(f.schedules, f.sessions);
  await scheduler.tick();
  const submitted = await f.schedules.get(item.id);
  assert.equal(submitted.status, "submitted");
  client.emit(
    "message_ack",
    { fromMe: true, id: { _serialized: submitted.messageId } },
    2,
  );
  await f.sessions.flushReceipts();
  assert.equal((await f.schedules.get(item.id)).status, "delivered");
  assert.equal(
    (await f.call("get", "/schedules?status=delivered")).body.total,
    1,
  );
  client.messageStates.get(submitted.messageId!)!.ack = 3;
  assert.equal(
    (await f.call("post", `/schedules/${item.id}/refresh-status`)).body.status,
    "read",
  );
  await scheduler.tick();
  assert.equal(client.sent.length, 1);
});

test("timeout mantém unknown; resultado tardio recupera ID e status sem duplicação", async (t) => {
  const f = await fixture({ sendTimeoutMs: 30 });
  t.after(() => f.close());
  const client = await f.add();
  let release!: () => void;
  client.sendGate = new Promise((resolve) => {
    release = resolve;
  });
  const key = { "Idempotency-Key": "timeout-operation" };
  const response = await f.call("post", "/messages", input, f.token, key);
  assert.equal(response.status, 502);
  const id = response.body.details.messageRecordId;
  assert.equal((await f.messageRepository.get(id)).status, "unknown");
  assert.equal(
    (await f.call("post", `/messages/${id}/refresh-status`)).status,
    409,
  );
  await assert.rejects(f.sessions.remove("comercial"), /Aguarde o envio/);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  await f.sessions.flushReceipts();
  const recovered = await f.messageRepository.get(id);
  assert.equal(recovered.status, "sent");
  assert.ok(recovered.messageId);
  await f.call("post", "/messages", input, f.token, key);
  assert.equal(client.sent.length, 1);
});

test("recibos são isolados por sessão e eventos de mensagens recebidas não alteram envios", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const other = await f.add("suporte");
  client.resultAck = 0;
  other.resultAck = 0;
  const a = await f.call("post", "/messages", input);
  const b = await f.call("post", "/messages", {
    ...input,
    sessionId: "suporte",
  });
  client.emit(
    "message_ack",
    { fromMe: false, id: { _serialized: a.body.messageId } },
    3,
  );
  await f.sessions.flushReceipts();
  assert.equal((await f.messageRepository.get(a.body.id)).status, "submitted");
  client.emit(
    "message_ack",
    { fromMe: true, id: { _serialized: a.body.messageId } },
    3,
  );
  await f.sessions.flushReceipts();
  assert.equal((await f.messageRepository.get(a.body.id)).status, "read");
  assert.equal((await f.messageRepository.get(b.body.id)).status, "submitted");
});
