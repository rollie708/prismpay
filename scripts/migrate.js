import { readFile, readdir } from 'node:fs/promises';
import { database } from '../server/db.js';
const db = database(process.env.DATABASE_URL);
if (!db) throw new Error('DATABASE_URL is required');
try {
  await db.transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(670621)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT version FROM schema_migrations WHERE version=$1',[file])).rows.length) continue;
      await client.query(await readFile(new URL(`../migrations/${file}`, import.meta.url),'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);
      console.log(`Applied ${file}`);
    }
  });
} finally { await db.pool.end(); }
