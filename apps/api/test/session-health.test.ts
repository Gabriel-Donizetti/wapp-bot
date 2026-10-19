import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { clientFactory } from "../src/modules/sessions/session-service.js";

test("reconexão encerra o Chrome da sessão mesmo quando CDP já desconectou", async () => {
  const client = clientFactory(tmpdir())("health-test");
  let signal: string | undefined;
  const process = Object.assign(new EventEmitter(), {
    exitCode: null as number | null,
    kill(value: string) {
      signal = value;
      queueMicrotask(() => {
        process.exitCode = 0;
        process.emit("exit", 0);
      });
      return true;
    },
  });
  Object.assign(client, {
    pupBrowser: { isConnected: () => false, process: () => process },
  });
  assert.equal(await client.isConnected(), false);
  await client.destroy();
  assert.equal(signal, "SIGTERM");
  assert.equal(process.exitCode, 0);
});

test("encerramento conectado usa o fechamento normal do navegador", async () => {
  const client = clientFactory(tmpdir())("health-test");
  let closed = false;
  Object.assign(client, {
    pupBrowser: {
      isConnected: () => true,
      process: () => ({
        exitCode: null,
        kill: () => assert.fail("kill inesperado"),
      }),
      close: async () => {
        closed = true;
      },
    },
  });
  await client.destroy();
  assert.equal(closed, true);
});
