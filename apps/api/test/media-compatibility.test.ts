import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const utilsPath = require.resolve("whatsapp-web.js/src/util/Injected/Utils.js");

// Executa o código real injetado pela biblioteca, com a fronteira de rede isolada.
// FakeClient.sendMessage sozinho não exercita a criação do Msg a partir de MediaData.
function injected(
  source: string,
  privateId: string | undefined,
  type: string,
  renamedKey = false,
) {
  let sent: Record<string, unknown> | undefined;
  const me = { isLid: () => false };
  class MsgKey {
    _serialized?: string;
    $1?: string;
    constructor() {
      if (renamedKey) this.$1 = "true_self_TEST";
      else this._serialized = "true_self_TEST";
    }
    static async newId() {
      return "TEST";
    }
  }
  const modules: Record<string, object> = {
    WAWebChatGetters: {
      getIsNewsletter: () => false,
      getIsBroadcast: () => false,
    },
    WALinkify: { findLink: () => undefined, findLinks: () => [] },
    WAWebUserPrefsMeUser: {
      getMaybeMeLidUser: () => me,
      getMaybeMePnUser: () => me,
    },
    WAWebMsgKey: MsgKey,
    WAWebGetEphemeralFieldsMsgActionsUtils: { getEphemeralFields: () => ({}) },
    WAWebCollections: {
      Msg: {
        get: (id: string) => {
          assert.equal(
            id,
            "true_self_TEST",
            "A consulta precisa de um ID serializado válido",
          );
          return sent;
        },
      },
    },
    WAWebSendMsgChatAction: {
      addAndSendMsgToChat(_chat: unknown, message: Record<string, unknown>) {
        if (Object.hasOwn(message, "__x_id"))
          throw new Error("Data passed to getter must include an id property");
        assert.ok(message.id instanceof MsgKey);
        sent = message;
        return [Promise.resolve(), Promise.resolve()];
      },
    },
  };
  const window = {
    require: (name: string) => modules[name] ?? {},
    WWebJS: {} as Record<string, (...args: any[]) => any>,
  };
  runInNewContext(`${source}\nexports.LoadUtils();`, { window, exports: {} });
  window.WWebJS.processMediaData = async () => ({
    __x_id: privateId,
    preview: "preview-base64",
    type,
    toJSON: () => ({
      type,
      mimetype: type === "image" ? "image/jpeg" : "application/pdf",
      filehash: "file-hash",
    }),
  });
  return Object.assign(
    () =>
      window.WWebJS.sendMessage!({ id: me }, "", {
        media: {},
        caption: "Legenda",
        waitUntilMsgSent: true,
      }) as Promise<Record<string, unknown>>,
    { serialize: window.WWebJS.getMessageModel! },
  );
}

test("código real do whatsapp-web.js: reproduz colisão de MediaData e preserva ID, mídia e legenda com o backport", async () => {
  const source = readFileSync(utilsPath, "utf8");
  const original = source.replace(
    /        \/\/ WappHub: evita colisão[^\n]*\n        delete message\.__x_id;\n\n/,
    "",
  );
  assert.notEqual(
    source,
    original,
    "npm postinstall precisa aplicar a correção",
  );
  for (const type of ["image", "document", "video", "ptt"]) {
    for (const privateId of ["media-model-id", undefined]) {
      await assert.rejects(
        injected(original, privateId, type)(),
        /include an id/,
      );
      const result = await injected(source, privateId, type)();
      assert.equal(result.type, type);
      assert.equal(result.caption, "Legenda");
      assert.equal(result.filehash, "file-hash");
      assert.equal(Object.hasOwn(result, "__x_id"), false);
    }
  }
});

test("backport de mídia é reaplicável sem duplicar a alteração", () => {
  const before = readFileSync(utilsPath, "utf8");
  execFileSync(process.execPath, ["scripts/patch-whatsapp.mjs"]);
  assert.equal(readFileSync(utilsPath, "utf8"), before);
});

test("WhatsApp Web atual: ID renomeado para $1 funciona na consulta e na resposta pública", async () => {
  const source = readFileSync(utilsPath, "utf8");
  const legacyLookup = source.replace(
    "Msg.get(newMsgKey._serialized ?? newMsgKey.$1);",
    "Msg.get(newMsgKey._serialized);",
  );
  await assert.rejects(
    injected(legacyLookup, "media-id", "image", true)(),
    /ID serializado válido/,
  );
  for (const renamed of [false, true]) {
    const execute = injected(source, "media-id", "image", renamed);
    const result = await execute();
    const response = execute.serialize({
      ...result,
      serialize: () => ({
        ...result,
        id: { ...(result.id as object), remote: { _serialized: "self@c.us" } },
      }),
    });
    assert.equal(response.id._serialized, "true_self_TEST");
    assert.equal(response.id.remote, "self@c.us");
  }
});
