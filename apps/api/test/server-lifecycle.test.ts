import test from "node:test";
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { prepareShutdown } from "../src/http/server-lifecycle.js";

test(
  "shutdown fecha preconnect sem headers e aguarda resposta do envio ativo",
  { timeout: 5000 },
  async () => {
    let release!: () => void;
    let began!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const server = createServer(async (_req, res) => {
      began();
      await gate;
      res.setHeader("Content-Type", "application/json");
      res.end('{"status":"sent"}');
    });
    const shutdown = prepareShutdown(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const idle = connect(address.port, "127.0.0.1");
    await once(idle, "connect");
    const idleClosed = once(idle, "close");
    const response = new Promise<string>((resolve, reject) => {
      const request = get(`http://127.0.0.1:${address.port}`, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve(body));
      });
      request.on("error", reject);
    });
    await started;
    let finished = false;
    const closing = shutdown().then(() => {
      finished = true;
    });
    await idleClosed;
    assert.equal(finished, false);
    release();
    assert.equal(JSON.parse(await response).status, "sent");
    await closing;
    assert.equal(finished, true);
  },
);
