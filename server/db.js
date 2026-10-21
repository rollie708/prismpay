import pg from 'pg';
export function database(url) {
  if (!url) return null;
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
  return {
    query: (text, values) => pool.query(text, values), pool,
    async transaction(fn) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  };
}
