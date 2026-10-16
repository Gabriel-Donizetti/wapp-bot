import assert from "node:assert/strict";
import { join } from "node:path";
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
  await page.type("input[name=username]", "admin");
  await page.type("input[name=password]", testPassword);
  await page.click(".login-form button.primary");
  await page.waitForSelector(".stats-grid");
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
  f.clients.get("suporte")!.emit("ready");
  await page.waitForFunction(
    () => document.querySelectorAll(".badge.ready").length === 2,
  );
  await nav("Nova mensagem");
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
  await page.type("textarea[name=text]", "Mensagem pelo React");
  await page.click(".message-panel button.primary");
  await page.waitForSelector(".success-box");
  assert.equal(client.sent.length, 1);
  assert.equal(client.sent[0]?.text, "Mensagem pelo React");
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
  await nav("Histórico");
  await page.waitForSelector("tbody tr");
  assert.match(
    await page.$eval("tbody", (node) => node.textContent || ""),
    /Mensagem pelo React/,
  );
  await nav("Usuários");
  await page.click(".page-title button.primary");
  await page.type(".modal input[name=name]", "Aplicativo teste");
  await page.type(".modal input[name=username]", "app-teste");
  await page.type(".modal input[name=password]", testPassword);
  await page.click(".modal button.primary");
  await page.waitForFunction(() =>
    document.querySelector(".users-grid")?.textContent?.includes("app-teste"),
  );
  await page.reload();
  await page.waitForSelector(".stats-grid");
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
  await page.click('button[aria-label="Abrir menu"]');
  await page.click(".logout");
  await page.waitForSelector(".login-form");
  await page.goto(base + "/docs/");
  await page.waitForSelector(".swagger-ui .info");
  assert.deepEqual(errors, []);
  console.log(
    "React + Express + PostgreSQL: login JWT, sessão/QR, filtros sem acentos, envio simulado, agendamento/fuso, cancelamento, histórico, criação de usuário, recarga autenticada, logout, Swagger e layout móvel validados.",
  );
} finally {
  await browser.close();
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  await f.close();
}
