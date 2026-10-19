import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext, Script } from "node:vm";
import { readPollVotes } from "../src/modules/sessions/poll-votes.js";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

function query(rows: object[], available = true) {
  const message = {
    type: "poll_creation",
    pollOptions: [
      { localId: 0, name: "Sim" },
      { localId: 1, name: "Não" },
    ],
  };
  const window = {
    require(name: string) {
      if (name === "WAWebCollections")
        return {
          Msg: {
            get: () => undefined,
            getMessagesById: async () => ({
              messages: available ? [message] : [],
            }),
          },
        };
      if (name === "WAWebMsgKey")
        return { fromString: (id: string) => ({ toString: () => id }) };
      if (name === "WAWebPollsVotesSchema")
        return {
          getTable: () => ({
            equals: async (_fields: unknown, key: string) => {
              assert.equal(key, "true_chat_POLL");
              return rows;
            },
          }),
        };
      throw new Error(name);
    },
  };
  return runInNewContext(`(${readPollVotes.toString()})("true_chat_POLL")`, {
    window,
    Uint8Array,
  });
}

test("votos nativos: ArrayBuffer, IDs locais e participante renomeado são normalizados", async () => {
  const result = await query([
    {
      sender: "a@c.us",
      senderTimestampMs: 1000,
      selectedOptionLocalIds: new Uint8Array([1, 0]).buffer,
    },
    {
      sender: { $1: "b@lid" },
      senderTimestampMs: 2000,
      selectedOptionLocalIds: [],
    },
  ]);
  assert.equal(result[0].voter, "a@c.us");
  assert.equal(result[0].selectedOptions[0].name, "Não");
  assert.equal(result[0].selectedOptions[1].name, "Sim");
  assert.equal(result[1].voter, "b@lid");
  assert.equal(result[1].selectedOptions.length, 0);
});

test("votos nativos: mensagem/opções ausentes não são tratados como zero votos", async () => {
  await assert.rejects(query([], false), /Enquete indisponível/);
  await assert.rejects(
    query([{ sender: "a@c.us", senderTimestampMs: 1000 }]),
    /Opções do voto/,
  );
  await assert.rejects(
    query([
      {
        sender: "a@c.us",
        senderTimestampMs: 1000,
        selectedOptionLocalIds: [9],
      },
    ]),
    /Opção de voto/,
  );
});

test("hook real: grava votos antes do evento e aceita MsgKey renomeado", async () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(
    require.resolve("whatsapp-web.js/src/Client.js"),
    "utf8",
  );
  new Script(source);
  const hook = source.match(
    /^            window\.WWebJS\.injectToFunction\(\n                \{ module: 'WAWebAddonPollVoteTableMode',[\s\S]*?^            \);\n/m,
  )?.[0];
  assert.ok(hook);
  let callback!: (
    module: unknown,
    original: () => Promise<string>,
    votes: object[],
  ) => Promise<string>;
  let persisted = false;
  let emitted = 0;
  let failEvent = false;
  let warnings = 0;
  const Msg = {
    get: (id: string) => {
      assert.ok(persisted);
      assert.equal(id, "true_chat_POLL");
      return { id: { $1: id } };
    },
  };
  const window = {
    WWebJS: {
      injectToFunction: (_options: unknown, fn: typeof callback) => {
        callback = fn;
      },
      getMessageModel: (value: unknown) => value,
    },
    require: () => ({
      getTable: () => ({
        equals: async () => [
          {
            sender: { $1: "a@lid" },
            senderTimestampMs: 1000,
            selectedOptionLocalIds: new Uint8Array([0]).buffer,
          },
        ],
      }),
    }),
    onPollVoteEvent: (votes: any[]) => {
      emitted++;
      if (failEvent) throw Error("evento indisponível");
      assert.equal(votes[0].sender, "a@lid");
      assert.equal(votes[0].selectedOptionLocalIds[0], 0);
    },
  };
  runInNewContext(hook, {
    window,
    Msg,
    Uint8Array,
    console: {
      warn: () => {
        warnings++;
      },
    },
  });
  const original = async () => {
    persisted = true;
    return "persistido";
  };
  const votes = [{ pollUpdateParentKey: { $1: "true_chat_POLL" } }];
  assert.equal(await callback({}, original, votes), "persistido");
  assert.equal(emitted, 1);
  failEvent = true;
  persisted = false;
  assert.equal(await callback({}, original, votes), "persistido");
  assert.equal(warnings, 1);
  await assert.rejects(
    callback(
      {},
      async () => {
        throw Error("falha nativa");
      },
      votes,
    ),
    /falha nativa/,
  );
});
