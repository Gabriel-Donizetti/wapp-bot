import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer";
import { fixture, testPassword } from "../apps/api/test/helpers.js";
const f = await fixture();
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
  args:
    process.env.CHROME_NO_SANDBOX === "true"
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [],
});
let server: ReturnType<typeof f.app.listen> | undefined;
try {
  const client = await f.add();
  client.groupName = "Operações São Paulo";
  for (let i = 0; i < 150; i++)
    client.contacts.push({
      id: {
        _serialized: `55118888${String(i).padStart(5, "0")}@c.us`,
        server: "c.us",
      },
      number: `55118888${String(i).padStart(5, "0")}`,
      name: `Contato ${i}`,
      isUser: true,
      isMyContact: true,
    });
  server = f.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width: 1440, height: 980 });
  await page.emulateTimezone("America/Sao_Paulo");
  const nav = async (label: string) => {
    for (const button of await page.$$("nav button")) {
      if (
        (await button.evaluate((node) => node.textContent))?.startsWith(label)
      ) {
        await button.click();
        return;
      }
    }
    throw new Error(`Navegação não encontrada: ${label}`);
  };
  await page.goto(base);
  assert.match(await page.title(), /WappHub/);
  await page.type("input[name=username]", "admin");
  await page.type("input[name=password]", testPassword);
  await page.click(".login-form button.primary");
  await page.waitForSelector(".stats-grid");
  await page.waitForFunction(
    () =>
      document.querySelector(".stat-card:nth-child(2) strong")?.textContent ===
      "1",
  );
  assert.equal(await page.$(".welcome-banner"), null);
  assert.equal((await page.content()).includes("Últimos envios"), false);
  await page.screenshot({
    path: join(tmpdir(), "wapp-overview.png"),
    fullPage: true,
  });
  await nav("Sessões");
  await page.click(".page-title button.primary");
  await page.type(".modal input[name=name]", "Suporte");
  await page.type(".modal input[name=id]", "suporte");
  await page.click(".modal button.primary");
  await page.waitForFunction(() =>
    document.querySelector(".sessions-grid")?.textContent?.includes("Suporte"),
  );
  f.clients.get("suporte")!.emit("qr", "test-qr-react");
  await page.waitForFunction(() =>
    Boolean(
      (document.querySelector(".qr-box img") as HTMLImageElement)?.naturalWidth,
    ),
  );
  await page.click(".qr-box .text-button");
  await page.waitForSelector('.modal input[name="pairingPhoneNumber"]');
  await page.type('.modal input[name="pairingPhoneNumber"]', "5511999999999");
  await page.click(".modal button.primary");
  await page.waitForFunction(() => !document.querySelector(".modal"));
  const pairingClient = f.clients.get("suporte")!;
  pairingClient.emit("qr", "qr-interno-pairing");
  await page.waitForFunction(
    () =>
      document.querySelector(".pairing-box output")?.textContent ===
      "ABCD-1234",
  );
  assert.equal(await page.$(".qr-box img"), null);
  assert.deepEqual(pairingClient.pairingRequests, ["5511999999999"]);
  pairingClient.emit("code", "WXYZ5678");
  await page.waitForFunction(
    () =>
      document.querySelector(".pairing-box output")?.textContent ===
      "WXYZ-5678",
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-session-pairing.png"),
    fullPage: true,
  });
  // Volta ao QR pela interface e confirma que a sessão antiga não interfere.
  await page.click(".pairing-box .text-button");
  await page.waitForSelector('.modal select[name="connectionMethod"]');
  assert.equal(await page.$('.modal input[name="pairingPhoneNumber"]'), null);
  await page.click(".modal button.primary");
  await page.waitForFunction(() => !document.querySelector(".modal"));
  f.clients.get("suporte")!.emit("qr", "qr-react-restaurado");
  pairingClient.emit("code", "OLDX1234");
  await page.waitForSelector(".qr-box img");
  assert.equal(await page.$(".pairing-box"), null);
  f.clients.get("suporte")!.emit("ready");
  await page.waitForFunction(
    () => document.querySelectorAll(".badge.ready").length === 2,
  );
  assert.equal(await page.$(".pairing-box output"), null);
  await nav("Nova mensagem");
  await page.waitForSelector(".recipient");
  client.emit("authenticated");
  await page.waitForSelector(".recipient-session-status .badge.authenticated");
  assert.match(
    await page.$eval(".recipient-list", (node) => node.textContent || ""),
    /Sincronizando WhatsApp/,
  );
  assert.doesNotMatch(
    await page.$eval(".recipient-summary", (node) => node.textContent || ""),
    /0 contatos/,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-directory-sync.png"),
    fullPage: true,
  });
  assert.equal(
    await page.$eval(
      'select[aria-label="Sessão de origem"]',
      (node) => (node as HTMLSelectElement).value,
    ),
    "comercial",
  );
  client.contactsError = true;
  client.groupsError = true;
  client.emit("ready");
  await page.waitForSelector(".recipient-panel .error-box");
  assert.match(
    await page.$eval(".recipient-list", (node) => node.textContent || ""),
    /Não foi possível carregar a lista/,
  );
  client.contactsError = false;
  client.groupsError = false;
  // Sem clicar em atualizar: a listagem se recupera após uma falha transitória.
  await page.waitForSelector(".recipient", { timeout: 25_000 });
  await page.waitForFunction(
    () => !document.querySelector(".recipient-panel .error-box"),
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-directory-ready.png"),
    fullPage: true,
  });
  await page.select('select[aria-label="Sessão de origem"]', "");
  await page.waitForFunction(() =>
    document
      .querySelector(".recipient-list")
      ?.textContent?.includes("Selecione uma sessão"),
  );
  await page.select('select[aria-label="Sessão de origem"]', "comercial");
  await page.waitForSelector(".recipient");
  await page.click(".segmented button:nth-child(3)");
  await page.type(
    'input[aria-label="Filtrar grupos pelo nome"]',
    "OPERACOES SAO",
  );
  assert.equal((await page.$$(".recipient")).length, 1);
  await page.click(".recipient");
  assert.equal(
    await page.$eval(
      "input[name=to]",
      (node) => (node as HTMLInputElement).value,
    ),
    "120363000000@g.us",
  );
  await page.click(".segmented button:nth-child(2)");
  await page.type(".search-field input", "Cliente");
  await page.click(".recipient");
  client.resultAck = 0;
  await page.type("textarea[name=text]", "Mensagem pelo React");
  await page.click(".message-panel button.primary");
  await page.waitForSelector(".delivery-card .badge.submitted");
  assert.equal(client.sent.length, 1);
  assert.equal(client.sent[0]?.text, "Mensagem pelo React");
  await page.waitForSelector(".delivery-card .badge.submitted");
  assert.match(
    await page.$eval(".delivery-card", (node) => node.textContent || ""),
    /ainda não confirmou/,
  );
  const firstMessageId = [...client.messageStates.keys()][0]!;
  client.emit(
    "message_ack",
    { fromMe: true, id: { _serialized: firstMessageId } },
    2,
  );
  await f.sessions.flushReceipts();
  await page.waitForSelector(".delivery-card .badge.delivered");
  client.messageStates.get(firstMessageId)!.ack = 3;
  await page.click(".delivery-card button");
  await page.waitForSelector(".delivery-card .badge.read");
  assert.match(
    await page.$eval(".delivery-card", (node) => node.textContent || ""),
    /Leitura confirmada/,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-delivery-status.png"),
    fullPage: true,
  });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-delivery-mobile.png"),
    fullPage: true,
  });
  await page.setViewport({ width: 1440, height: 980 });
  client.resultAck = 1;
  await page.type("textarea[name=text]", "Agendamento pelo React");
  await page.click(".delivery-options button:nth-child(2)");
  const expected = await page.$eval("input[type=datetime-local]", (node) => {
    const date = new Date(Date.now() + 3600000);
    date.setSeconds(0, 0);
    const value = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    return date.toISOString();
  });
  await page.click(".message-panel button.primary");
  await page.waitForFunction(() =>
    document.querySelector(".success-box")?.textContent?.includes("agendada"),
  );
  const schedule = (await f.schedules.list()).data[0]!;
  assert.equal(schedule.sendAt, expected);
  await nav("Agendamentos");
  await page.waitForSelector("tbody tr");
  await page.click("tbody .text-button");
  await page.waitForFunction(() =>
    document.querySelector("tbody .badge")?.textContent?.includes("Cancelada"),
  );
  await nav("Nova mensagem");
  await page.waitForSelector(".recipient");
  await page.click(".recipient");
  await page.select('select[name="messageType"]', "image");
  const imagePath = join(f.dir, "image.png");
  writeFileSync(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const upload = await page.$('input[type="file"]');
  assert.ok(upload);
  await upload.uploadFile(imagePath);
  await page.type('textarea[name="text"]', "Imagem pelo React");
  await page.click(".message-panel button.primary");
  await page.waitForSelector(".success-box");
  assert.equal(client.deliveries.at(-1)!.options?.caption, "Imagem pelo React");
  assert.equal(typeof client.deliveries.at(-1)!.content, "object");
  await page.select('select[name="messageType"]', "document");
  const documentPath = join(f.dir, "documento.txt");
  writeFileSync(documentPath, "Documento enviado pelo painel");
  const documentUpload = await page.$('input[type="file"]');
  assert.ok(documentUpload);
  await documentUpload.uploadFile(documentPath);
  await page.click(".message-panel button.primary");
  await page.waitForFunction(
    () => !document.querySelector('input[type="file"]'),
  );
  assert.equal(client.deliveries.at(-1)!.options?.sendMediaAsDocument, true);
  await page.select('select[name="messageType"]', "poll");
  assert.equal(
    await page.$eval(
      'input[name="pollDurationHours"]',
      (node) => (node as HTMLInputElement).value,
    ),
    "24",
  );
  await page.type('input[name="pollName"]', "Qual horário?");
  await page.type('textarea[name="pollOptions"]', "Manhã\nTarde");
  await page.click(".message-panel button.primary");
  await page.waitForFunction(
    () =>
      document
        .querySelector('select[name="messageType"]')
        ?.getAttribute("name") === "messageType" &&
      !document.querySelector('input[name="pollName"]'),
  );
  assert.equal(client.deliveries.length, 4);
  client.pollVotes = [
    {
      voter: "5511888888888@c.us",
      selectedOptions: [{ id: 0, name: "Manhã" }],
      interractedAtTs: Date.now(),
    } as (typeof client.pollVotes)[number],
  ];
  await nav("Histórico");
  await page.waitForSelector(".poll-responses button");
  await page.click(".poll-responses button");
  await page.waitForSelector(".poll-results");
  assert.match(
    await page.$eval(".poll-results", (node) => node.textContent || ""),
    /1 participante · 1 seleção/,
  );
  assert.match(
    await page.$eval(".poll-results", (node) => node.textContent || ""),
    /5511888888888@c.us/,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-poll-responses.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".modal", { hidden: true });
  await page.waitForSelector("tbody tr");
  await page.select('select[aria-label="Filtrar status"]', "read");
  await page.waitForSelector("tbody .badge.read");
  assert.equal((await page.$$("tbody tr")).length, 1);
  await page.select('select[aria-label="Filtrar status"]', "");
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 4,
  );
  assert.match(
    await page.$eval("tbody", (node) => node.textContent || ""),
    /Mensagem pelo React/,
  );
  // Mais de uma página em outra sessão: o filtro deve isolar os registros
  // e voltar à primeira página, preservando o status selecionado.
  for (let index = 0; index < 21; index++) {
    await f.messages.send(
      {
        sessionId: "suporte",
        to: "5511888888888",
        text: `Histórico suporte ${index}`,
      },
      f.user.id,
    );
  }
  await page.click(".page-title button.secondary");
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 20,
  );
  await page.click('button[aria-label="Próxima página"]');
  await page.waitForFunction(() =>
    document.querySelector(".pagination span")?.textContent?.includes("21–25"),
  );
  await page.select('select[aria-label="Filtrar por sessão"]', "comercial");
  await page.waitForFunction(() =>
    document
      .querySelector(".pagination span")
      ?.textContent?.includes("1–4 de 4"),
  );
  assert.deepEqual(
    await page.$$eval("tbody tr td:nth-child(2) strong", (nodes) => [
      ...new Set(nodes.map((node) => node.textContent)),
    ]),
    ["comercial"],
  );
  await page.select('select[aria-label="Filtrar status"]', "read");
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 1,
  );
  await page.select('select[aria-label="Filtrar por sessão"]', "suporte");
  await page.waitForFunction(
    () =>
      document.querySelector(".empty h3")?.textContent ===
      "Nenhum resultado com esses filtros",
  );
  assert.equal(
    await page.$eval(
      'select[aria-label="Filtrar status"]',
      (node) => (node as HTMLSelectElement).value,
    ),
    "read",
  );
  await page.select('select[aria-label="Filtrar status"]', "");
  await page.waitForFunction(() =>
    document
      .querySelector(".pagination span")
      ?.textContent?.includes("1–20 de 21"),
  );
  assert.deepEqual(
    await page.$$eval("tbody tr td:nth-child(2) strong", (nodes) => [
      ...new Set(nodes.map((node) => node.textContent)),
    ]),
    ["suporte"],
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-history-session-filter.png"),
    fullPage: true,
  });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewport({ width: 1440, height: 980 });
  await page.select('select[aria-label="Filtrar por sessão"]', "");
  await page.waitForFunction(() =>
    document
      .querySelector(".pagination span")
      ?.textContent?.includes("1–20 de 25"),
  );
  await nav("Enquetes");
  await page.waitForSelector(".poll-overview");
  assert.match(
    await page.$eval(".poll-overview", (node) => node.textContent || ""),
    /Sai da lista em/,
  );
  assert.equal((await page.$$(".poll-overview")).length, 1);
  assert.match(
    await page.$eval(".poll-overview", (node) => node.textContent || ""),
    /Qual horário/,
  );
  await page.click(".poll-overview .poll-responses button");
  await page.waitForSelector(".poll-results");
  await page.screenshot({
    path: join(tmpdir(), "wapp-polls-page.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".modal", { hidden: true });
  await f.pool.query(
    "UPDATE messages SET sent_at=NOW()-INTERVAL '2 days' WHERE type='poll'",
  );
  await page.click(".page-actions button");
  await page.waitForFunction(
    () =>
      document.querySelector(".empty h3")?.textContent ===
      "Nenhuma enquete ativa",
  );
  assert.equal((await f.call("get", "/polls?state=expired")).body.total, 1);
  await page.click(".page-title button.primary");
  await page.waitForSelector('input[name="pollName"]');
  assert.equal(
    await page.$eval(
      'select[name="messageType"]',
      (node) => (node as HTMLSelectElement).value,
    ),
    "poll",
  );
  // A consulta de leitores ocorre somente ao abrir os detalhes do grupo.
  const groupMessage = await f.messages.send(
    {
      sessionId: "comercial",
      to: "120363000000@g.us",
      text: "Leituras do grupo",
    },
    f.user.id,
  );
  client.messageInfo = {
    read: [
      { id: { _serialized: "5511888888888@c.us" }, t: 1792400000 },
      { id: { $1: "123456789@lid" }, t: 1792400100 },
    ],
  };
  assert.equal(client.infoRequests.length, 0);
  await nav("Histórico");
  await page.waitForSelector(".group-readers > button");
  assert.equal((await page.$$(".group-readers > button")).length, 1);
  await page.click(".group-readers > button");
  await page.waitForSelector(".group-reader-list li");
  const readerText = await page.$eval(
    ".group-reader-results",
    (node) => node.textContent || "",
  );
  assert.match(readerText, /2 participantes com leitura confirmada/);
  assert.match(readerText, /Cliente/);
  assert.match(readerText, /Contato privado/);
  assert.match(readerText, /Leu em/);
  assert.deepEqual(client.infoRequests, [groupMessage.record.messageId]);
  await page.screenshot({
    path: join(tmpdir(), "wapp-group-readers.png"),
    fullPage: false,
  });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-group-readers-mobile.png"),
    fullPage: false,
  });
  client.messageInfo = { read: [] };
  await page.click(".modal button.secondary");
  await page.waitForFunction(() =>
    document
      .querySelector(".group-reader-results")
      ?.textContent?.includes("Nenhuma leitura confirmada"),
  );
  client.messageInfoError = true;
  await page.click(".modal button.secondary");
  await page.waitForSelector('.modal [role="alert"]');
  assert.match(
    await page.$eval('.modal [role="alert"]', (node) => node.textContent || ""),
    /Não foi possível consultar/,
  );
  client.messageInfoError = false;
  await page.keyboard.press("Escape");
  await page.waitForSelector(".modal", { hidden: true });
  await page.setViewport({ width: 1440, height: 980 });
  await nav("API & integrações");
  await page.waitForSelector(
    '.page-title a.primary[href="/integration-guide"]',
  );
  const guide = await fetch(base + "/integration-guide");
  assert.equal(guide.status, 200);
  assert.match(await guide.text(), /Consultar respostas da enquete/);
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewport({ width: 1440, height: 980 });
  await nav("Usuários");
  await page.click(".page-title button.primary");
  await page.type(".modal input[name=name]", "Aplicativo teste");
  await page.type(".modal input[name=username]", "app-teste");
  await page.type(".modal input[name=password]", testPassword);
  await page.click(".modal button.primary");
  await page.waitForFunction(() =>
    document.querySelector(".users-grid")?.textContent?.includes("app-teste"),
  );
  // Contas de integração recebem somente um token, apresentado uma vez.
  await page.click(".page-title button.primary");
  await page.select('.modal select[name="type"]', "integration");
  assert.equal(await page.$('.modal input[name="username"]'), null);
  assert.equal(await page.$('.modal input[name="password"]'), null);
  assert.equal(await page.$('.modal select[name="role"]'), null);
  await page.type('.modal input[name="name"]', "Sistema integrado");
  await page.screenshot({
    path: join(tmpdir(), "wapp-integration-create.png"),
  });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-integration-create-mobile.png"),
  });
  await page.click(".modal button.primary");
  await page.waitForSelector('textarea[aria-label="Token da integração"]');
  const token = await page.$eval(
    'textarea[aria-label="Token da integração"]',
    (node) => (node as HTMLTextAreaElement).value,
  );
  assert.match(token, /^wapp_int_[A-Za-z0-9_-]{43}$/);
  const tokenStatus = async (value: string) =>
    (
      await fetch(base + "/api/v1/sessions", {
        headers: { Authorization: `Bearer ${value}` },
      })
    ).status;
  assert.equal(await tokenStatus(token), 200);
  await page.click(".modal button.primary");
  await page.waitForSelector(".modal", { hidden: true });
  await page.waitForFunction(() =>
    document
      .querySelector(".users-grid")
      ?.textContent?.includes("Sistema integrado"),
  );
  const clickTokenAction = async (label: string) => {
    await page.evaluate((label) => {
      const card = [...document.querySelectorAll(".user-card")].find(
        (card) => card.querySelector("h3")?.textContent === "Sistema integrado",
      );
      const button = [...(card?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === label,
      );
      if (!button) throw new Error("Ação de token não encontrada");
      button.click();
    }, label);
  };
  await clickTokenAction("Gerar novo token");
  await page.waitForSelector(".modal form");
  await page.click(".modal button.primary");
  await page.waitForSelector('textarea[aria-label="Token da integração"]');
  const replacement = await page.$eval(
    'textarea[aria-label="Token da integração"]',
    (node) => (node as HTMLTextAreaElement).value,
  );
  assert.notEqual(replacement, token);
  assert.equal(await tokenStatus(token), 401);
  assert.equal(await tokenStatus(replacement), 200);
  await page.click(".modal button.primary");
  await page.waitForSelector(".modal", { hidden: true });
  await clickTokenAction("Revogar token");
  await page.waitForSelector(".modal form");
  await page.click(".modal button.primary");
  await page.waitForSelector(".modal", { hidden: true });
  await page.waitForFunction(() =>
    document
      .querySelector(".users-grid")
      ?.textContent?.includes("Token revogado"),
  );
  assert.equal(await tokenStatus(replacement), 401);
  assert.equal(
    await page.$('textarea[aria-label="Token da integração"]'),
    null,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-integration-revoked-mobile.png"),
  });
  await page.setViewport({ width: 1440, height: 980 });
  client.emit("disconnected", "teste");
  f.clients.get("suporte")!.emit("disconnected", "teste");
  await page.reload();
  await page.waitForSelector(".stats-grid");
  await page.waitForSelector(".welcome-banner");
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: join(tmpdir(), "wapp-mobile-react.png"),
    fullPage: true,
  });
  // Aguarda a animação de recolher a barra após a mudança de viewport.
  await page.waitForFunction(() => {
    const sidebar = document.querySelector(".sidebar");
    return sidebar && sidebar.getBoundingClientRect().right <= 0;
  });
  await page.click('button[aria-label="Abrir menu"]');
  await page.waitForSelector(".sidebar.open");
  await page.waitForFunction(() => {
    const rect = document.querySelector(".logout")?.getBoundingClientRect();
    return rect && rect.left >= -1 && rect.right <= innerWidth + 1;
  });
  await page.click(".logout");
  await page.waitForSelector(".login-form");
  await page.goto(base + "/docs/");
  await page.waitForSelector(".swagger-ui .info");
  assert.deepEqual(errors, []);
  console.log(
    "React + Express + PostgreSQL: login JWT, sessão/QR, filtros sem acentos, envios simulados de texto/imagem/documento/enquete, respostas de enquetes, guia acessível e home condicional, acompanhamento de submissão/entrega/leitura, consulta direta, leitores de grupo com nomes/horários e filtro por status, agendamento/fuso, cancelamento, histórico, criação de usuário e integração, token Bearer sem senha, rotação e revogação imediatas, recarga autenticada, logout, Swagger e layout móvel validados.",
  );
} catch (error) {
  const pages = await browser.pages();
  for (let index = 0; index < pages.length; index++) {
    await pages[index]!.screenshot({
      path: join(tmpdir(), `wapp-e2e-failure-${index}.png`),
      fullPage: true,
    }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  await f.close();
}
