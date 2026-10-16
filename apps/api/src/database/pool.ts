import pg from "pg";

pg.types.setTypeParser(1184, (value) => new Date(value).toISOString());
export function createPool(connectionString: string, schema?: string) {
  if (schema && !/^[a-z_][a-z0-9_]*$/.test(schema))
    throw new Error("Schema inválido.");
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    options: schema ? `-c search_path=${schema}` : undefined,
  });
}
export type Pool = pg.Pool;
export async function transaction<T>(
  pool: pg.Pool,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
