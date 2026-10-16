import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleRepository } from "../src/modules/schedules/schedule-repository.js";
import { Scheduler } from "../src/modules/schedules/scheduler.js";
import { fixture } from "./helpers.js";
const input = {
  sessionId: "comercial",
  to: "5511888888888",
  text: "Lembrete",
  sendAt: "2020-01-01T12:00:00Z",
};
test("PostgreSQL: agendador respeita futuro, cancelamento e ciclos simultâneos", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const due = await f.schedules.create(input);
  const future = await f.schedules.create({
    ...input,
    sendAt: "2099-01-01T12:00:00Z",
  });
  const cancelled = await f.schedules.create(input);
  await f.schedules.cancel(cancelled.id);
  const scheduler = new Scheduler(f.schedules, f.sessions);
  await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]);
  await scheduler.tick();
  assert.equal(client.sent.length, 1);
  assert.equal((await f.schedules.get(due.id)).status, "sent");
  assert.equal((await f.schedules.get(future.id)).status, "pending");
  assert.equal((await f.schedules.get(cancelled.id)).status, "cancelled");
});
test("offline aguarda conexão e envios incertos não são repetidos", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add("comercial", false);
  const item = await f.schedules.create(input);
  const scheduler = new Scheduler(f.schedules, f.sessions);
  await scheduler.tick();
  assert.equal((await f.schedules.get(item.id)).status, "pending");
  client.emit("ready");
  client.sendError = true;
  await scheduler.tick();
  assert.equal((await f.schedules.get(item.id)).status, "unknown");
  client.sendError = false;
  await scheduler.tick();
  assert.equal(client.sent.length, 0);
});
test("reabertura do repositório preserva dados e recuperação marca interrupções como incertas", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  const pending = await f.schedules.create(input);
  const interrupted = await f.schedules.create(input);
  const wins = await Promise.all([
    f.schedules.claim(interrupted.id),
    f.schedules.claim(interrupted.id),
  ]);
  assert.equal(wins.filter(Boolean).length, 1);
  const reopened = new ScheduleRepository(f.pool);
  await reopened.recoverInterrupted();
  assert.equal((await reopened.get(interrupted.id)).status, "unknown");
  assert.equal((await reopened.get(pending.id)).status, "pending");
  await new Scheduler(reopened, f.sessions).tick();
  assert.equal(f.clients.get("comercial")!.sent.length, 1);
});
test("envio em andamento bloqueia cancelamento/remoção e shutdown aguarda término", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  let release!: () => void;
  let started!: () => void;
  client.sendGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  client.onSend = started;
  const item = await f.schedules.create(input);
  const scheduler = new Scheduler(f.schedules, f.sessions);
  const running = scheduler.tick();
  await begun;
  await assert.rejects(f.schedules.cancel(item.id), /pendentes/);
  await assert.rejects(f.sessions.remove("comercial"), /Aguarde o envio/);
  let stopped = false;
  const stopping = scheduler.stop().then(() => {
    stopped = true;
  });
  assert.equal(stopped, false);
  release();
  await running;
  await stopping;
  assert.equal((await f.schedules.get(item.id)).status, "sent");
});

test("falha do banco após o envio não transforma mensagem enviada em failed nem repete o envio", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const item = await f.schedules.create(input);
  const finish = f.schedules.finish.bind(f.schedules);
  f.schedules.finish = async (...args) => {
    if (args[1] === "sent") throw new Error("Banco indisponível após envio");
    return finish(...args);
  };
  const scheduler = new Scheduler(f.schedules, f.sessions);
  await assert.rejects(scheduler.tick(), /Banco indisponível/);
  assert.equal((await f.schedules.get(item.id)).status, "sending");
  assert.equal(client.sent.length, 1);
  await f.schedules.recoverInterrupted();
  await scheduler.tick();
  assert.equal((await f.schedules.get(item.id)).status, "unknown");
  assert.equal(client.sent.length, 1);
});
