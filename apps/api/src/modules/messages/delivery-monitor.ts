import type { Sessions } from "../sessions/session-service.js";
import { DeliveryRepository } from "./delivery-repository.js";

export class DeliveryMonitor {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    private repository: DeliveryRepository,
    private sessions: Pick<Sessions, "list" | "isReady" | "refreshReceipt">,
    private onError: (error: unknown, sessionId: string) => void = () => {},
  ) {}
  start(intervalMs = 5 * 60_000) {
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
    for (const session of await this.sessions.list()) {
      if (this.stopping || !this.sessions.isReady(session.id)) continue;
      for (const receipt of await this.repository.pending(session.id)) {
        if (this.stopping || !this.sessions.isReady(session.id)) break;
        try {
          await this.sessions.refreshReceipt(session.id, receipt.messageId);
        } catch (error) {
          this.onError(error, session.id);
        } finally {
          await this.repository.checked(session.id, receipt.messageId);
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
