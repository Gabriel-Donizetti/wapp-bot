import { transaction, type Pool } from "../../database/pool.js";
import type { PollVoteData } from "../sessions/poll-votes.js";

export class PollVoteRepository {
  constructor(readonly pool: Pool) {}
  async save(sessionId: string, messageId: string, votes: PollVoteData[]) {
    await transaction(this.pool, async (db) => {
      for (const vote of votes) {
        await db.query(
          `INSERT INTO poll_votes(session_id,message_id,voter,voted_at,options)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,message_id,voter,voted_at)
          DO UPDATE SET options=EXCLUDED.options`,
          [
            sessionId,
            messageId,
            vote.voter,
            new Date(vote.interractedAtTs).toISOString(),
            JSON.stringify(vote.selectedOptions),
          ],
        );
      }
      await db.query(
        `INSERT INTO poll_sync(session_id,message_id,last_synced_at) VALUES($1,$2,NOW())
        ON CONFLICT(session_id,message_id) DO UPDATE SET last_synced_at=NOW(),last_checked_at=NOW()`,
        [sessionId, messageId],
      );
    });
  }
  async checked(sessionId: string, messageId: string) {
    await this.pool.query(
      `INSERT INTO poll_sync(session_id,message_id) VALUES($1,$2)
      ON CONFLICT(session_id,message_id) DO UPDATE SET last_checked_at=NOW()`,
      [sessionId, messageId],
    );
  }
  async snapshot(sessionId: string, messageId: string, expiresAt: string) {
    const [meta, rows] = await Promise.all([
      this.pool.query(
        `SELECT last_synced_at AS "syncedAt" FROM poll_sync WHERE session_id=$1 AND message_id=$2`,
        [sessionId, messageId],
      ),
      this.pool.query(
        `SELECT DISTINCT ON(voter) voter,options AS "selectedOptions",voted_at AS "updatedAt"
        FROM poll_votes WHERE session_id=$1 AND message_id=$2 AND voted_at<=$3 ORDER BY voter,voted_at DESC`,
        [sessionId, messageId, expiresAt],
      ),
    ]);
    return {
      syncedAt: meta.rows[0]?.syncedAt as string | undefined,
      votes: rows.rows.map((row) => ({
        voter: row.voter as string,
        selectedOptions: row.selectedOptions as Array<{ name: string }>,
        interractedAtTs: Date.parse(row.updatedAt),
      })),
    };
  }
}
