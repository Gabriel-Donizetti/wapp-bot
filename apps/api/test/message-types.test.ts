import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import whatsapp from "whatsapp-web.js";
import { fixture } from "./helpers.js";
import { Scheduler } from "../src/modules/schedules/scheduler.js";
const base = { sessionId: "comercial", to: "5511888888888" };
const data = Buffer.from("Arquivo de teste").toString("base64");
const media = (mimetype: string, filename: string) => ({
  mimetype,
  filename,
  data,
});
const cases = [
  { type: "text", text: "Mensagem" },
  { type: "image", media: media("image/png", "imagem.png"), caption: "Imagem" },
  { type: "audio", media: media("audio/mpeg", "audio.mp3") },
  { type: "voice", media: media("audio/ogg", "voz.ogg") },
  { type: "video", media: media("video/mp4", "video.mp4"), asGif: true },
  { type: "document", media: media("application/pdf", "arquivo.pdf") },
  {
    type: "sticker",
    media: media("image/webp", "figurinha.webp"),
    name: "Pacote",
    author: "Teste",
  },
  {
    type: "location",
    location: { latitude: -23.55, longitude: -46.63, name: "Encontro" },
  },
  { type: "contacts", contacts: ["5511777777777@c.us", "123456789@lid"] },
  {
    type: "poll",
    poll: {
      name: "Horário?",
      options: ["Manhã", "Tarde"],
      allowMultipleAnswers: true,
    },
  },
] as const;

test("API: dez tipos de envio, histórico sem base64 e mesmas chaves entre rotas genérica e específica", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  for (const content of cases) {
    const input = { ...base, ...content };
    const key = { "Idempotency-Key": `type-${content.type}` };
    const sent = await f.call(
      "post",
      `/messages/${content.type}`,
      input,
      f.token,
      key,
    );
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.type, content.type);
    assert.equal(sent.body.content.type, content.type);
    assert.equal(sent.body.status, "sent");
    const repeated = await f.call("post", "/messages", input, f.token, key);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.id, sent.body.id);
    if ("media" in content) {
      assert.equal(sent.body.content.media.data, undefined);
      assert.equal(
        sent.body.content.media.size,
        Buffer.byteLength(data, "base64"),
      );
      assert.match(sent.body.content.media.sha256, /^[a-f0-9]{64}$/);
      const delivered = client.deliveries.at(-1)!;
      assert.ok(delivered.content instanceof whatsapp.MessageMedia);
      assert.equal(delivered.content.data, data);
    }
  }
  assert.equal(client.deliveries.length, 10);
  assert.equal(client.deliveries[3]!.options?.sendAudioAsVoice, true);
  assert.equal(client.deliveries[4]!.options?.sendVideoAsGif, true);
  assert.equal(client.deliveries[5]!.options?.sendMediaAsDocument, true);
  assert.equal(client.deliveries[6]!.options?.sendMediaAsSticker, true);
  assert.ok(client.deliveries[7]!.content instanceof whatsapp.Location);
  assert.equal(
    (client.deliveries[7]!.content as whatsapp.Location).name,
    "Encontro",
  );
  assert.equal((client.deliveries[8]!.content as whatsapp.Contact[]).length, 2);
  assert.ok(client.deliveries[9]!.content instanceof whatsapp.Poll);
  assert.equal(
    (client.deliveries[9]!.content as whatsapp.Poll).options
      .allowMultipleAnswers,
    true,
  );
  assert.equal((await f.call("get", "/messages")).body.total, 10);
});

test("respostas e menções validam conversa antes de enviar e mantêm resultado incerto", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  const input = {
    ...base,
    type: "text",
    text: "Olá @5511777777777",
    options: {
      replyTo: "false_5511888888888@c.us_ABC",
      mentions: ["5511777777777@c.us"],
      groupMentions: [{ id: "120363000000@g.us", subject: "Equipe" }],
    },
  };
  assert.equal((await f.call("post", "/messages/text", input)).status, 201);
  assert.equal(
    client.deliveries[0]!.options?.quotedMessageId,
    input.options.replyTo,
  );
  assert.deepEqual(
    client.deliveries[0]!.options?.mentions,
    input.options.mentions,
  );
  assert.deepEqual(
    client.deliveries[0]!.options?.groupMentions,
    input.options.groupMentions,
  );
  assert.equal(client.deliveries[0]!.options?.ignoreQuoteErrors, false);
  client.quotedChatId = "outro@g.us";
  const wrong = await f.call("post", "/messages", input);
  assert.equal(wrong.status, 422);
  assert.equal(wrong.body.error, "INVALID_REPLY");
  assert.equal(
    (await f.call("get", `/messages/${wrong.body.details.messageRecordId}`))
      .body.status,
    "failed",
  );
  assert.equal(client.deliveries.length, 1);
  client.sendError = true;
  const uncertain = await f.call("post", "/messages/image", {
    ...base,
    ...cases[1],
  });
  assert.equal(uncertain.body.error, "SEND_UNCERTAIN");
  assert.equal(
    (await f.call("get", `/messages/${uncertain.body.details.messageRecordId}`))
      .body.status,
    "unknown",
  );
});

test("validação rejeita arquivos e formatos inválidos antes de reservar envio", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  for (const content of [
    { type: "buttons", text: "Depreciado" },
    {
      type: "image",
      media: { mimetype: "image/png", data: "data:image/png;base64,YQ==" },
    },
    { type: "image", media: { mimetype: "image/png", data: "YQ" } },
    { type: "image", media: media("audio/mpeg", "incorreto.mp3") },
    {
      type: "image",
      media: { ...media("image/png", "imagem.png"), url: "http://localhost" },
    },
    { type: "image", media: media("image/png", "../imagem.png") },
    { type: "document", media: { mimetype: "application/pdf", data } },
    { type: "location", location: { latitude: 91, longitude: 0 } },
    { type: "contacts", contacts: [] },
    { type: "poll", poll: { name: "Quando?", options: ["Um", " um "] } },
    { type: "poll", poll: { name: "Quando?", options: ["Só uma"] } },
    { type: "text", text: "Oi", options: { mentions: ["telefone-sem-id"] } },
  ])
    assert.equal(
      (await f.call("post", "/messages", { ...base, ...content })).status,
      400,
      JSON.stringify(content),
    );
  assert.equal(
    (
      await f.call("post", "/messages/image", {
        ...base,
        type: "text",
        text: "Errado",
      })
    ).status,
    400,
  );
  const unauth = await f.call(
    "post",
    "/messages/document",
    { ...base, ...cases[5] },
    null,
  );
  assert.equal(unauth.status, 401);
  assert.equal(client.deliveries.length, 0);
  assert.equal((await f.call("get", "/messages")).body.total, 0);
});

test("arquivos acima de 32 KiB funcionam; limite de 16 MiB e mudança de bytes na chave são respeitados", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.add();
  const large = {
    ...base,
    type: "document",
    media: {
      mimetype: "application/pdf",
      filename: "teste.pdf",
      data: Buffer.alloc(64 * 1024, 1).toString("base64"),
    },
  };
  const key = { "Idempotency-Key": "arquivo-unico" };
  const first = await f.call("post", "/messages", large, f.token, key);
  assert.equal(first.status, 201);
  const changed = await f.call(
    "post",
    "/messages",
    {
      ...large,
      media: {
        ...large.media,
        data: Buffer.alloc(64 * 1024, 2).toString("base64"),
      },
    },
    f.token,
    key,
  );
  assert.equal(changed.status, 409);
  const oversized = await f.call("post", "/messages", {
    ...large,
    media: {
      ...large.media,
      data: Buffer.alloc(16 * 1024 * 1024 + 1).toString("base64"),
    },
  });
  assert.equal(oversized.status, 400);
});

test("agendamento multimídia sobrevive à reconexão e remove base64 após envio ou cancelamento", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add("comercial", false);
  const created = await f.call("post", "/schedules", {
    ...base,
    ...cases[1],
    sendAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.content.media.data, undefined);
  const item = created.body;
  await f.pool.query(
    "UPDATE schedules SET send_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
    [item.id],
  );
  const scheduler = new Scheduler(f.schedules, f.sessions);
  await scheduler.tick();
  assert.equal((await f.schedules.get(item.id)).status, "pending");
  assert.equal(
    (await f.pool.query("SELECT payload FROM schedules WHERE id=$1", [item.id]))
      .rows[0].payload.media.data,
    data,
  );
  client.emit("ready");
  await scheduler.tick();
  assert.equal((await f.schedules.get(item.id)).status, "sent");
  assert.equal(
    (client.deliveries[0]!.content as whatsapp.MessageMedia).data,
    data,
  );
  assert.equal(
    (await f.pool.query("SELECT payload FROM schedules WHERE id=$1", [item.id]))
      .rows[0].payload,
    null,
  );
  const cancelled = await f.call("post", "/schedules", {
    ...base,
    ...cases[5],
    sendAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(
    (await f.call("post", `/schedules/${cancelled.body.id}/cancel`)).status,
    200,
  );
  assert.equal(
    (
      await f.pool.query("SELECT payload FROM schedules WHERE id=$1", [
        cancelled.body.id,
      ])
    ).rows[0].payload,
    null,
  );
});

test("canais: consulta com filtro, envio permitido e formatos incompatíveis recusados", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const client = await f.add();
  assert.equal(
    (await f.call("get", "/sessions/comercial/channels?search=novidades")).body
      .total,
    1,
  );
  assert.equal(
    (await f.call("get", "/sessions/comercial/channels?search=outro")).body
      .total,
    0,
  );
  const channel = { ...base, to: "120363000000@newsletter" };
  assert.equal(
    (await f.call("post", "/messages/text", { ...channel, text: "Novidade" }))
      .status,
    201,
  );
  assert.equal(client.deliveries[0]!.to, channel.to);
  for (const content of [cases[2], cases[5], cases[7], cases[8]])
    assert.equal(
      (await f.call("post", "/messages", { ...channel, ...content })).status,
      400,
    );
});

test("OpenAPI publica os dez contratos e o guia de integração", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const result = await request(f.app).get("/openapi.json");
  assert.equal(result.status, 200);
  for (const type of cases.map((item) => item.type)) {
    const operation = result.body.paths[`/messages/${type}`].post;
    assert.ok(
      operation.requestBody.content["application/json"].schema.properties[
        type === "text"
          ? "text"
          : ["location", "contacts", "poll"].includes(type)
            ? type
            : "media"
      ],
    );
  }
  const guide = await request(f.app).get("/integration-guide");
  assert.equal(guide.status, 200);
  assert.match(guide.headers["content-type"] ?? "", /^text\/html/);
  assert.equal(guide.headers["content-disposition"], undefined);
  assert.match(guide.text, /<h1>Integrar aplicativos com o Wapp<\/h1>/);
  assert.match(guide.text, /<table>/);
  assert.match(guide.text, /<pre><code class="language-js">/);
  assert.match(guide.text, /href="\/docs\/"/);
});
