import test from "node:test";
import assert from "node:assert/strict";
import type whatsapp from "whatsapp-web.js";
import { fixture } from "./helpers.js";
import { Scheduler } from "../src/modules/schedules/scheduler.js";
import { PollMonitor } from "../src/modules/messages/poll-monitor.js";
import { PollRepository } from "../src/modules/messages/poll-repository.js";
import { migrate } from "../src/database/migrate.js";

const input = {
  sessionId: "comercial",
  to: "5511888888888",
  type: "poll" as const,
  poll: { name: "Quando?", options: ["Manhã", "Tarde"] },
};
const vote = (name: string, time: number) =>
  ({
    voter: "a@c.us",
    selectedOptions: [{ name }],
    interractedAtTs: time,
  }) as whatsapp.PollVote;

test("prazo: padrão de 24h, duração própria e filtro de expiradas preservam histórico", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  const standard = await f.call("post", "/messages/poll", input);
  const short = await f.call("post", "/messages/poll", {
    ...input,
    poll: { ...input.poll, durationHours: 1 },
  });
  assert.equal(standard.body.content.poll.durationHours, 24);
  await f.pool.query(
    "UPDATE messages SET created_at=NOW()-INTERVAL '20 days',sent_at=NOW()-INTERVAL '2 hours' WHERE id=ANY($1::uuid[])",
    [[standard.body.id, short.body.id]],
  );
  const active = await f.call("get", "/polls");
  assert.equal(active.body.total, 1);
  assert.equal(active.body.data[0].recordId, standard.body.id);
  assert.equal(active.body.data[0].expired, false);
  const expired = await f.call("get", "/polls?state=expired");
  assert.equal(expired.body.total, 1);
  assert.equal(expired.body.data[0].recordId, short.body.id);
  assert.equal(expired.body.data[0].expired, true);
  assert.equal((await f.call("get", "/polls?state=all")).body.total, 2);
  assert.equal((await f.call("get", `/messages/${short.body.id}`)).status, 200);
  for (const durationHours of [0, -1, 721])
    assert.equal(
      (
        await f.call("post", "/messages/poll", {
          ...input,
          poll: { ...input.poll, durationHours },
        })
      ).status,
      400,
    );
  const key = { "Idempotency-Key": "poll-day" };
  const first = await f.call("post", "/messages/poll", input, f.token, key);
  const repeated = await f.call(
    "post",
    "/messages/poll",
    { ...input, poll: { ...input.poll, durationHours: 24 } },
    f.token,
    key,
  );
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.id, first.body.id);
  assert.equal(
    (
      await f.call(
        "post",
        "/messages/poll",
        { ...input, poll: { ...input.poll, durationHours: 2 } },
        f.token,
        key,
      )
    ).status,
    409,
  );
});

test("prazo: agendamento inicia a contagem após o envio, mesmo criado dias antes", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  const created = await f.call("post", "/schedules", {
    ...input,
    sendAt: new Date(Date.now() + 60000).toISOString(),
  });
  await f.pool.query(
    "UPDATE schedules SET created_at=NOW()-INTERVAL '3 days' WHERE id=$1",
    [created.body.id],
  );
  assert.equal((await f.call("get", "/polls")).body.data[0].expiresAt, null);
  await f.pool.query(
    "UPDATE schedules SET send_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
    [created.body.id],
  );
  await new Scheduler(f.schedules, f.sessions).tick();
  const active = (await f.call("get", "/polls")).body.data[0];
  assert.ok(Date.parse(active.expiresAt) > Date.now() + 23 * 3600000);
});

test("votos: persistência, consulta offline e limite de tempo preservam seleção anterior", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const sent = await f.call("post", "/messages/poll", {
    ...input,
    poll: { ...input.poll, durationHours: 1 },
  });
  const path = `/messages/${sent.body.id}/poll-results`;
  const reads = t.mock.method(f.sessions, "pollVotes");
  client.pollVotes = [vote("Manhã", Date.now())];
  const first = await f.call("get", path);
  assert.equal(first.body.totalVoters, 1);
  assert.equal(first.body.source, "whatsapp");
  const expires = Date.parse(first.body.expiresAt);
  const clock = t.mock.method(Date, "now", () => expires + 1000);
  client.pollVotes = [vote("Tarde", expires + 500)];
  const result = await f.call("get", path);
  assert.equal(result.status, 200);
  assert.equal(result.body.expired, true);
  assert.equal(result.body.source, "stored");
  assert.equal(reads.mock.callCount(), 1);
  assert.equal(result.body.options[0].votes, 1);
  assert.equal(result.body.options[1].votes, 0);
  clock.mock.restore();
  await f.sessions.disconnect("comercial");
  const offline = await f.call("get", path);
  assert.equal(offline.status, 200);
  assert.equal(offline.body.source, "stored");
  assert.equal(offline.body.totalVoters, 1);
  assert.ok(offline.body.warning);
  assert.equal(client.sent.length, 1);
});

test("monitor coleta e persiste votos sem abrir modal nem reenviar", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const sent = await f.call("post", "/messages/poll", input);
  client.pollVotes = [vote("Tarde", Date.now())];
  const monitor = new PollMonitor(new PollRepository(f.pool), f.sessions);
  t.after(() => monitor.stop());
  await Promise.all([monitor.tick(), monitor.tick()]);
  const stored = await f.pool.query(
    "SELECT * FROM poll_votes WHERE message_id=$1",
    [sent.body.messageId],
  );
  assert.equal(stored.rowCount, 1);
  await f.sessions.disconnect("comercial");
  const cached = await f.call("get", `/messages/${sent.body.id}/poll-results`);
  assert.equal(cached.body.totalVoters, 1);
  assert.equal(cached.body.source, "stored");
  assert.equal(client.sent.length, 1);
});

test("queries e monitor excluem expiradas, com ou sem coleta, inclusive agendadas", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const active = await f.call("post", "/messages/poll", input);
  const cached = await f.call("post", "/messages/poll", input);
  const uncached = await f.call("post", "/messages/poll", input);
  const scheduled = await f.call("post", "/schedules", {
    ...input,
    sendAt: new Date(Date.now() + 60000).toISOString(),
  });
  await f.pool.query(
    "UPDATE schedules SET send_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
    [scheduled.body.id],
  );
  await new Scheduler(f.schedules, f.sessions).tick();
  assert.equal(
    (await f.call("get", `/messages/${cached.body.id}/poll-results`)).status,
    200,
  );
  await f.pool.query(
    "UPDATE messages SET sent_at=NOW()-INTERVAL '2 days' WHERE id=ANY($1::uuid[])",
    [[cached.body.id, uncached.body.id]],
  );
  await f.pool.query(
    "UPDATE schedules SET sent_at=NOW()-INTERVAL '2 days' WHERE id=$1",
    [scheduled.body.id],
  );
  const polls = new PollRepository(f.pool);
  assert.deepEqual(
    (await polls.pending("comercial")).map((poll) => poll.recordId),
    [active.body.id],
  );
  const listed = await f.call("get", "/polls");
  assert.equal(listed.body.total, 1);
  assert.equal(listed.body.data[0].recordId, active.body.id);
  assert.equal((await f.call("get", "/polls?state=expired")).body.total, 3);

  const reads = t.mock.method(f.sessions, "pollVotes");
  const monitor = new PollMonitor(polls, f.sessions);
  t.after(() => monitor.stop());
  await monitor.tick();
  assert.equal(reads.mock.callCount(), 1);
  const collected = reads.mock.calls[0];
  assert.ok(collected);
  assert.equal(collected.arguments[1], active.body.messageId);
  const saved = await f.call("get", `/messages/${cached.body.id}/poll-results`);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.source, "stored");
  assert.equal(saved.body.expired, true);
  for (const path of [
    `/messages/${uncached.body.id}/poll-results`,
    `/schedules/${scheduled.body.id}/poll-results`,
  ]) {
    const result = await f.call("get", path);
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "POLL_RESULTS_UNAVAILABLE");
  }
  assert.equal(reads.mock.callCount(), 1);
  assert.equal(client.sent.length, 4);
});

test("migração: enquetes antigas sem prazo recebem 1 dia e expiram sem excluir registros", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  const old = await f.messageRepository.reserve(input, f.user.id);
  await f.pool.query(
    "UPDATE messages SET content=content #- '{poll,durationHours}',created_at=NOW()-INTERVAL '2 days',status='unknown' WHERE id=$1",
    [old.record.id],
  );
  await f.pool.query(
    "DROP TABLE poll_votes,poll_sync; DELETE FROM schema_migrations WHERE version=4",
  );
  await migrate(f.pool);
  assert.equal(
    (await f.messageRepository.get(old.record.id)).content.poll?.durationHours,
    24,
  );
  assert.equal((await f.call("get", "/polls")).body.total, 0);
  assert.equal((await f.call("get", "/polls?state=expired")).body.total, 1);
  assert.equal(
    (await f.call("get", `/messages/${old.record.id}/poll-results`)).body.error,
    "POLL_NOT_SENT",
  );
});

test("primeira consulta indisponível nunca é apresentada como enquete sem respostas", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const sent = await f.call("post", "/messages/poll", input);
  client.quoteMissing = true;
  const result = await f.call("get", `/messages/${sent.body.id}/poll-results`);
  assert.equal(result.status, 422);
  assert.equal(result.body.error, "POLL_UNAVAILABLE");
});
