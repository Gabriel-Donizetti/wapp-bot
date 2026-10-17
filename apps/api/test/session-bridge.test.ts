import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const source = readFileSync(
  require.resolve("whatsapp-web.js/src/util/Puppeteer.js"),
  "utf8",
);
function bridge(code = source) {
  const sandbox = {
    module: {
      exports: {} as {
        exposeFunctionIfAbsent: (
          page: object,
          name: string,
          callback: () => void,
        ) => Promise<void>;
      },
    },
  };
  runInNewContext(code, sandbox);
  return sandbox.module.exports.exposeFunctionIfAbsent;
}
function page({
  installed = true,
  closed = false,
  message = "Protocol error (Runtime.addBinding): Target closed",
} = {}) {
  let exists = false;
  let called = false;
  return {
    async evaluate() {
      return exists;
    },
    isClosed() {
      return closed;
    },
    async exposeFunction() {
      called = true;
      exists = installed;
      throw new Error(message);
    },
    wasCalled() {
      return called;
    },
  };
}

test("inicialização: iframe encerrado não interrompe bindings válidos da página principal", async () => {
  const original = source.replace(
    /    \/\/ WappHub: aceita apenas[^\n]*\n    try \{[\s\S]*?        throw error;\n    \}/,
    "    await page.exposeFunction(name, fn);",
  );
  assert.notEqual(source, original);
  await assert.rejects(
    bridge(original)(page(), "onMessageAckEvent", () => {}),
    /Target closed/,
  );
  const main = page();
  await bridge()(main, "onMessageAckEvent", () => {});
  assert.equal(main.wasCalled(), true);
  await bridge()(
    page({
      message:
        "Protocol error (Page.addScriptToEvaluateOnNewDocument): Target closed",
    }),
    "onPollVoteEvent",
    () => {},
  );
});

test("inicialização: página fechada, binding ausente e outros erros continuam falhando", async () => {
  for (const broken of [
    page({ closed: true }),
    page({ installed: false }),
    page({ message: "Outra falha" }),
  ])
    await assert.rejects(bridge()(broken, "onMessageAckEvent", () => {}));
});
