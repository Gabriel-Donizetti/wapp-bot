import { AppError } from "../../shared/errors.js";
import type { Sessions } from "../sessions/session-service.js";
import { ScheduleRepository } from "./schedule-repository.js";

export class Scheduler {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private store: ScheduleRepository,
    private sessions: Pick<Sessions, "isReady" | "send">,
  ) {}

  async start(intervalMs: number, onError: (error: unknown) => void) {
    await this.store.recoverInterrupted();
    this.timer = setInterval(() => {
      void this.tick().catch(onError);
    }, intervalMs);
    this.timer.unref();
    void this.tick().catch(onError);
  }

  tick(now = new Date().toISOString()): Promise<void> {
    if (this.running) return this.running;
    if (this.stopping) return Promise.resolve();
    this.running = this.process(now).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async process(now: string) {
    for (const item of await this.store.due(now)) {
      if (this.stopping) break;
      if (
        !this.sessions.isReady(item.sessionId) ||
        !(await this.store.claim(item.id))
      )
        continue;
      let result: Awaited<ReturnType<Sessions["send"]>>;
      try {
        result = await this.sessions.send(
          await this.store.deliveryInput(item.id),
          async (late) => {
            await this.store.finish(
              item.id,
              "sent",
              late.messageId,
              null,
              late.ack,
            );
          },
        );
      } catch (error) {
        if (error instanceof AppError && error.code === "SESSION_NOT_READY") {
          await this.store.finish(item.id, "pending", null, null);
        } else {
          const uncertain =
            error instanceof AppError && error.code === "SEND_UNCERTAIN";
          await this.store.finish(
            item.id,
            uncertain ? "unknown" : "failed",
            null,
            error instanceof AppError
              ? error.message
              : "Falha na operação com o WhatsApp.",
          );
        }
        continue;
      }
      await this.store.finish(
        item.id,
        "sent",
        result.messageId,
        null,
        result.ack,
      );
    }
  }

  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }
}
