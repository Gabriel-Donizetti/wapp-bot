export interface PollVoteData {
  voter: string;
  selectedOptions: Array<{ name: string }>;
  interractedAtTs: number;
}

// Executada no Chromium. Lê o snapshot persistido pelo WhatsApp, sem depender
// do construtor PollVote nem dos formatos diferentes do evento vote_update.
export async function readPollVotes(
  messageId: string,
): Promise<PollVoteData[]> {
  const wa = window as unknown as { require(name: string): any };
  const { Msg } = wa.require("WAWebCollections");
  const message =
    Msg.get(messageId) ??
    (await Msg.getMessagesById([messageId]))?.messages?.[0];
  if (!message || message.type !== "poll_creation")
    throw new Error("Enquete indisponível no WhatsApp.");
  const key = wa.require("WAWebMsgKey").fromString(messageId).toString();
  const rows = await wa
    .require("WAWebPollsVotesSchema")
    .getTable()
    .equals(["parentMsgKey"], key);
  return rows.map((row: any) => {
    const voter =
      typeof row.sender === "string"
        ? row.sender
        : (row.sender?._serialized ?? row.sender?.$1);
    const time = Number(row.senderTimestampMs);
    if (!voter || !Number.isFinite(time) || time <= 0)
      throw new Error("Participante ou horário do voto indisponível.");
    if (row.selectedOptionLocalIds == null)
      throw new Error("Opções do voto indisponíveis.");
    const ids = Array.from(new Uint8Array(row.selectedOptionLocalIds));
    const selectedOptions = ids.map((id) => {
      const option = message.pollOptions.find(
        (item: any) => item.localId === id,
      );
      if (!option || typeof option.name !== "string")
        throw new Error("Opção de voto desconhecida.");
      return { name: option.name };
    });
    return { voter, selectedOptions, interractedAtTs: time };
  });
}
