import type { Sessions } from "../sessions/session-service.js";
import { PollRepository } from "./poll-repository.js";
import { PollVoteRepository } from "./poll-vote-repository.js";
import { MessageRepository } from "./message-repository.js";
import { ScheduleRepository } from "../schedules/schedule-repository.js";
import { pollResults } from "./poll-results.js";

export class PollMonitor {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    private polls: PollRepository,
    private sessions: Pick<Sessions, "list" | "isReady" | "pollVotes">,
    private onError: (error: unknown, sessionId: string) => void = () => {},
  ) {}
  start(intervalMs = 60_000) {
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
  }
  tick(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.process()
      .catch((error) => this.onError(error, ""))
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async process() {
    const votes = new PollVoteRepository(this.polls.pool);
    const messages = new MessageRepository(this.polls.pool);
    const schedules = new ScheduleRepository(this.polls.pool);
    for (const session of await this.sessions.list()) {
      if (this.stopping || !this.sessions.isReady(session.id)) continue;
      for (const poll of await this.polls.pending(session.id)) {
        if (this.stopping || !this.sessions.isReady(session.id)) break;
        try {
          const record = await (
            poll.kind === "messages" ? messages : schedules
          ).get(poll.recordId);
          await pollResults(record, this.sessions, votes);
        } catch (error) {
          this.onError(error, session.id);
        } finally {
          await votes.checked(session.id, poll.messageId!);
        }
      }
    }
  }
  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }
}
