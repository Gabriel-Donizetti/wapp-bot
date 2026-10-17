import test from "node:test";
import assert from "node:assert/strict";
import type whatsapp from "whatsapp-web.js";
import { fixture } from "./helpers.js";
import { Scheduler } from "../src/modules/schedules/scheduler.js";

const poll = {
  sessionId: "comercial",
  to: "5511888888888",
  type: "poll",
  poll: {
    name: "Horário?",
    options: ["Manhã", "Tarde"],
    allowMultipleAnswers: true,
  },
};
const vote = (voter: string, names: string[], time: number) =>
  ({
    voter,
    selectedOptions: names.map((name) => ({
      name,
      localId: name === "Manhã" ? 0 : 1,
    })),
    interractedAtTs: time,
  }) as unknown as whatsapp.PollVote;

test("área de enquetes lista somente polls, reúne envios e agenda e filtra por sessão", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  await f.add("outra");
  const sent = await f.call("post", "/messages", poll);
  await f.call("post", "/messages", {
    sessionId: "comercial",
    to: poll.to,
    text: "Texto fora das enquetes",
  });
  const scheduled = await f.call("post", "/schedules", {
    ...poll,
    sessionId: "outra",
    sendAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const list = await f.call("get", "/polls");
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.total, 2);
  const message = list.body.data.find(
    (item: { kind: string }) => item.kind === "messages",
  );
  const schedule = list.body.data.find(
    (item: { kind: string }) => item.kind === "schedules",
  );
  assert.equal(message.recordId, sent.body.id);
  assert.equal(message.poll.name, poll.poll.name);
  assert.equal(message.deliveryStatus, "sent");
  assert.equal(schedule.recordId, scheduled.body.id);
  assert.equal(schedule.deliveryStatus, "pending");
  assert.equal(schedule.startedAt, null);
  assert.equal(
    (await f.call("get", "/polls?sessionId=comercial")).body.total,
    1,
  );
  assert.equal(
    (await f.call("get", "/polls?limit=1&offset=1")).body.data.length,
    1,
  );
  assert.equal((await f.call("get", "/polls", undefined, null)).status, 401);
});

test("enquetes: agrega seleção mais recente, múltiplas escolhas e retiradas sem reenviar", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const sent = await f.call("post", "/messages/poll", poll);
  assert.equal(sent.status, 201);
  const path = `/messages/${sent.body.id}/poll-results`;
  const empty = await f.call("get", path);
  assert.equal(empty.status, 200, JSON.stringify(empty.body));
  assert.equal(empty.body.totalVoters, 0);
  const now = Date.now();
  client.pollVotes = [
    vote("a@c.us", ["Manhã"], now - 1000),
    vote("b@lid", ["Tarde"], now),
    vote("a@c.us", ["Manhã", "Tarde"], now),
    vote("b@lid", [], now + 1000),
    vote("b@lid", ["Manhã"], now - 2000),
  ];
  const result = await f.call("get", path);
  assert.equal(result.status, 200);
  assert.equal(result.body.recordId, sent.body.id);
  assert.equal(result.body.totalVoters, 1);
  assert.equal(result.body.totalSelections, 2);
  assert.deepEqual(result.body.options, [
    { id: 0, name: "Manhã", votes: 1, voters: ["a@c.us"] },
    { id: 1, name: "Tarde", votes: 1, voters: ["a@c.us"] },
  ]);
  assert.equal(result.body.votes[1].selectedOptions.length, 0);
  assert.equal(
    result.body.votes[1].updatedAt,
    new Date(now + 1000).toISOString(),
  );
  assert.equal(client.deliveries.length, 1);
  assert.equal((await f.call("get", path, undefined, null)).status, 401);
});

test("enquetes: sessão correta e mensagem disponível são obrigatórias; indisponível não significa zero votos", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const other = await f.add("outra");
  other.pollVotes = [vote("outro@c.us", ["Manhã"], Date.now())];
  const sent = await f.call("post", "/messages", poll);
  const path = `/messages/${sent.body.id}/poll-results`;
  assert.equal((await f.call("get", path)).body.totalVoters, 0);
  client.quoteMissing = true;
  const missing = await f.call("get", path);
  assert.equal(missing.status, 422);
  assert.equal(missing.body.error, "POLL_UNAVAILABLE");
  client.quoteMissing = false;
  client.pollVotesError = true;
  assert.equal((await f.call("get", path)).status, 502);
  client.pollVotesError = false;
  client.pollVotes = [vote("x@c.us", ["Opção desconhecida"], Date.now())];
  assert.equal((await f.call("get", path)).status, 502);
  await f.sessions.disconnect("comercial");
  assert.equal((await f.call("get", path)).body.error, "SESSION_NOT_READY");
  const text = await f.messageRepository.reserve(
    { sessionId: "outra", to: poll.to, text: "Texto" },
    f.user.id,
  );
  assert.equal(
    (await f.call("get", `/messages/${text.record.id}/poll-results`)).body
      .error,
    "NOT_A_POLL",
  );
  assert.equal(
    (await f.call("get", "/messages/not-an-id/poll-results")).status,
    400,
  );
});

test("enquetes agendadas: consulta exige envio; votos disponíveis após execução", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const created = await f.call("post", "/schedules", {
    ...poll,
    sendAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(created.status, 201);
  const path = `/schedules/${created.body.id}/poll-results`;
  assert.equal((await f.call("get", path)).body.error, "POLL_NOT_SENT");
  await f.pool.query(
    "UPDATE schedules SET send_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
    [created.body.id],
  );
  await new Scheduler(f.schedules, f.sessions).tick();
  client.pollVotes = [vote("cliente@c.us", ["Tarde"], Date.now())];
  const result = await f.call("get", path);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.totalVoters, 1);
  assert.equal(result.body.options[1].votes, 1);
  assert.equal(client.deliveries.length, 1);
});
