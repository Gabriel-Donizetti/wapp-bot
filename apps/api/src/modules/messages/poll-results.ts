import type { Message, PollResults, Schedule } from "@wapp/contracts";
import { AppError } from "../../shared/errors.js";
import type { Sessions } from "../sessions/session-service.js";
import { PollVoteRepository } from "./poll-vote-repository.js";

export async function pollResults(
  record: Message | Schedule,
  sessions: Pick<Sessions, "pollVotes">,
  store: PollVoteRepository,
): Promise<PollResults> {
  const poll = record.content.poll;
  if (record.type !== "poll" || !poll)
    throw new AppError(409, "NOT_A_POLL", "Este registro não é uma enquete.");
  if (!record.messageId)
    throw new AppError(
      409,
      "POLL_NOT_SENT",
      "A enquete ainda não possui um ID WhatsApp para consultar.",
    );
  const expiresAt = new Date(
    Date.parse(record.submittedAt ?? record.createdAt) +
      (poll.durationHours ?? 24) * 3600_000,
  ).toISOString();
  const expired = Date.parse(expiresAt) <= Date.now();
  let snapshot = await store.snapshot(
    record.sessionId,
    record.messageId,
    expiresAt,
  );
  let source: "whatsapp" | "stored" = "stored";
  let warning: string | null = null;
  if (expired && !snapshot.syncedAt)
    throw new AppError(
      409,
      "POLL_RESULTS_UNAVAILABLE",
      "O prazo da enquete terminou sem uma coleta confirmada de respostas.",
    );
  if (!expired) {
    try {
      const live = await sessions.pollVotes(record.sessionId, record.messageId);
      for (const vote of live) {
        if (
          typeof vote.voter !== "string" ||
          !vote.voter ||
          !Number.isFinite(vote.interractedAtTs) ||
          vote.interractedAtTs <= 0 ||
          !Array.isArray(vote.selectedOptions) ||
          vote.selectedOptions.some(
            (option) => !poll.options.includes(option.name),
          )
        )
          throw new AppError(
            502,
            "POLL_UNAVAILABLE",
            "O WhatsApp retornou respostas que não puderam ser identificadas.",
          );
      }
      await store.save(record.sessionId, record.messageId, live);
      snapshot = await store.snapshot(
        record.sessionId,
        record.messageId,
        expiresAt,
      );
      source = "whatsapp";
    } catch (error) {
      if (!snapshot.syncedAt) throw error;
      warning =
        "Não foi possível atualizar no WhatsApp. Exibindo os votos já coletados.";
    }
  }
  const received = snapshot.votes;
  const latest = new Map<string, (typeof received)[number]>();
  for (const vote of received) {
    const previous = latest.get(vote.voter);
    if (!previous || vote.interractedAtTs >= previous.interractedAtTs)
      latest.set(vote.voter, vote);
  }
  const options = poll.options.map((name, id) => ({
    id,
    name,
    votes: 0,
    voters: [] as string[],
  }));
  const votes = [...latest.values()].map((vote) => {
    // A versão 1.34.7 entrega localId em runtime, embora o .d.ts declare id.
    // O nome vem da mensagem original e evita depender dessa divergência.
    const selected = new Set(vote.selectedOptions.map((option) => option.name));
    if (
      !vote.voter ||
      [...selected].some((name) => !poll.options.includes(name))
    )
      throw new AppError(
        502,
        "POLL_UNAVAILABLE",
        "O WhatsApp retornou respostas que não puderam ser identificadas.",
      );
    const selectedOptions = options.filter((option) =>
      selected.has(option.name),
    );
    for (const option of selectedOptions) {
      option.votes++;
      option.voters.push(vote.voter);
    }
    const time = new Date(vote.interractedAtTs);
    return {
      voter: vote.voter,
      selectedOptions: selectedOptions.map(({ id, name }) => ({ id, name })),
      updatedAt: Number.isFinite(time.getTime()) ? time.toISOString() : null,
    };
  });
  return {
    recordId: record.id,
    sessionId: record.sessionId,
    messageId: record.messageId,
    name: poll.name,
    allowMultipleAnswers: poll.allowMultipleAnswers ?? false,
    totalVoters: votes.filter((vote) => vote.selectedOptions.length > 0).length,
    totalSelections: options.reduce((sum, option) => sum + option.votes, 0),
    options,
    votes,
    fetchedAt: new Date().toISOString(),
    expiresAt,
    expired,
    source,
    syncedAt: snapshot.syncedAt ?? null,
    warning,
  };
}
