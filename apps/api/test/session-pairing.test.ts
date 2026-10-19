import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";

test("código: valida número e autenticação antes de cadastrar", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const input = {
    id: "codigo",
    name: "Código",
    pairingPhoneNumber: "5511999999999",
  };
  assert.equal((await f.call("post", "/sessions", input, null)).status, 401);
  for (const number of [
    "",
    "119999",
    "55 (11) 99999-9999",
    "0".repeat(13),
    "1".repeat(16),
  ]) {
    assert.equal(
      (
        await f.call("post", "/sessions", {
          ...input,
          pairingPhoneNumber: number,
        })
      ).status,
      400,
    );
  }
  assert.equal((await f.call("get", "/sessions")).body.sessions.length, 0);
  assert.equal(
    (await f.call("get", "/sessions/ausente/pairing-code")).status,
    404,
  );
});

test("código: geração, renovação e expiração não expõem credenciais na listagem", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const created = await f.call("post", "/sessions", {
    id: "codigo",
    name: "Código",
    pairingPhoneNumber: "+5511999999999",
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await f.call("get", "/sessions/codigo/pairing-code")).body.code,
    null,
  );
  const client = f.clients.get("codigo")!;
  client.emit("qr", "qr-interno");
  const first = await f.call("get", "/sessions/codigo/pairing-code");
  assert.equal(first.body.status, "pairing");
  assert.equal(first.body.code, "ABCD1234");
  assert.equal(first.body.phoneNumber, "5511999999999");
  assert.ok(Date.parse(first.body.expiresAt) > Date.now());
  assert.equal((await f.call("get", "/sessions/codigo/qr")).body.qr, null);
  assert.equal(
    (await f.call("get", "/sessions/codigo/pairing-code", undefined, null))
      .status,
    401,
  );
  client.emit("qr", "qr-renovado");
  assert.deepEqual(client.pairingRequests, ["5511999999999"]);
  client.emit("code", "WXYZ5678");
  const renewed = await f.call("get", "/sessions/codigo/pairing-code");
  assert.equal(renewed.body.code, "WXYZ5678");
  assert.doesNotMatch(
    JSON.stringify((await f.call("get", "/sessions")).body),
    /WXYZ5678|ABCD1234|pairingPhoneNumber/,
  );
  const clock = t.mock.method(
    Date,
    "now",
    () => Date.parse(renewed.body.expiresAt) + 1,
  );
  assert.equal(
    (await f.call("get", "/sessions/codigo/pairing-code")).body.code,
    null,
  );
  clock.mock.restore();
  client.emit("authenticated");
  client.emit("code", "LATE1234");
  const authenticated = await f.call("get", "/sessions/codigo/pairing-code");
  assert.equal(authenticated.body.status, "authenticated");
  assert.equal(authenticated.body.code, null);
  assert.equal(authenticated.body.phoneNumber, null);
  client.emit("ready");
  assert.equal((await f.call("get", "/sessions/codigo")).body.status, "ready");
});

test("código: troca de método exige desconexão e eventos antigos não afetam nova sessão", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const old = await f.add("comercial", false);
  old.emit("qr", "qr-primeiro");
  const options = { pairingPhoneNumber: "5511999999999" };
  const conflict = await f.call("post", "/sessions/comercial/connect", options);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, "SESSION_ALREADY_STARTED");
  await f.call("post", "/sessions/comercial/disconnect");
  assert.equal(
    (await f.call("post", "/sessions/comercial/connect", options)).status,
    200,
  );
  const current = f.clients.get("comercial")!;
  current.emit("qr", "qr-interno");
  assert.equal(
    (await f.call("get", "/sessions/comercial/pairing-code")).body.code,
    "ABCD1234",
  );
  old.emit("code", "OLDX1234");
  assert.equal(
    (await f.call("get", "/sessions/comercial/pairing-code")).body.code,
    "ABCD1234",
  );
  await f.call("post", "/sessions/comercial/disconnect");
  assert.equal(
    (await f.call("get", "/sessions/comercial/pairing-code")).body.code,
    null,
  );
  await f.call("post", "/sessions/comercial/connect");
  f.clients.get("comercial")!.emit("qr", "qr-de-volta");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.match(
    (await f.call("get", "/sessions/comercial/qr")).body.qr,
    /^data:image\/png;base64,/,
  );
});

test("código: falha é sinalizada e resposta tardia não restaura código após autenticar", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  await f.call("post", "/sessions", {
    id: "codigo",
    name: "Código",
    pairingPhoneNumber: "5511999999999",
  });
  const client = f.clients.get("codigo")!;
  client.pairingError = true;
  client.emit("qr", "qr-interno");
  const failed = await f.call("get", "/sessions/codigo");
  assert.equal(failed.body.status, "error");
  assert.match(failed.body.error, /gerar o código/);
  assert.equal(
    (await f.call("get", "/sessions/codigo/pairing-code")).body.code,
    null,
  );
  await f.call("post", "/sessions/codigo/connect", {
    pairingPhoneNumber: "5511999999999",
  });
  const recovered = f.clients.get("codigo")!;
  let release!: () => void;
  recovered.pairingGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  recovered.emit("qr", "qr-interno");
  recovered.emit("authenticated");
  release();
  assert.equal(
    (await f.call("get", "/sessions/codigo/pairing-code")).body.code,
    null,
  );
});
