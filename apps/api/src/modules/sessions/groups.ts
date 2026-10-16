export interface GroupSummary {
  id: string;
  name: string;
}

// Executada no Chromium. A serialização completa de getChats() também carrega
// mensagens e pode falhar no IndexedDB de uma conversa, bloqueando toda a lista.
export function readGroupSummaries(): GroupSummary[] {
  const wa = window as unknown as {
    require(name: string): {
      Chat: {
        getModelsArray(): Array<{
          id: { _serialized: string; server: string };
          formattedTitle?: string;
          name?: string;
          groupMetadata?: { subject?: string };
        }>;
      };
    };
  };
  return wa
    .require("WAWebCollections")
    .Chat.getModelsArray()
    .filter((chat) => chat.id.server === "g.us")
    .map((chat) => ({
      id: chat.id._serialized,
      name:
        chat.formattedTitle ||
        chat.name ||
        chat.groupMetadata?.subject ||
        chat.id._serialized,
    }));
}
