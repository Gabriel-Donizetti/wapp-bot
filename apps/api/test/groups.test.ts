import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readGroupSummaries } from "../src/modules/sessions/groups.js";

test("lista IDs e nomes dos grupos sem serializar conversas ou consultar mensagens no IndexedDB", () => {
  const chats = [
    {
      id: { _serialized: "5511888888888@c.us", server: "c.us" },
      formattedTitle: "Contato",
    },
    {
      id: { _serialized: "120363000000@g.us", server: "g.us" },
      formattedTitle: "Equipe",
    },
    {
      id: { _serialized: "120363000001@g.us", server: "g.us" },
      groupMetadata: { subject: "Operações" },
    },
  ].map((chat) => ({
    ...chat,
    serialize() {
      throw new Error("IndexedDB DataError em conversa");
    },
  }));
  const context = {
    window: {
      require(name: string) {
        assert.equal(name, "WAWebCollections");
        return { Chat: { getModelsArray: () => chats } };
      },
    },
  };
  const result = runInNewContext(
    `(${readGroupSummaries.toString()})()`,
    context,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { id: "120363000000@g.us", name: "Equipe" },
    { id: "120363000001@g.us", name: "Operações" },
  ]);
});
