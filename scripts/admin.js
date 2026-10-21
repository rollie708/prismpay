import { randomUUID } from 'node:crypto';
import { database } from '../server/db.js';
const [issuer, subject] = process.argv.slice(2);
if (!issuer || !subject) throw new Error('Usage: npm run admin -- <exact OIDC issuer> <exact OIDC subject>. Sign in first.');
const db = database(process.env.DATABASE_URL);
if (!db) throw new Error('DATABASE_URL required');
try {
  await db.transaction(async c => {
    const { rows } = await c.query("UPDATE users SET role='admin',updated_at=now() WHERE issuer=$1 AND subject=$2 RETURNING id", [issuer,subject]);
    if (!rows.length) throw new Error('No matching user. Sign in first.');
    await c.query('INSERT INTO audit_logs(id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),rows[0].id,'operator.bootstrap',rows[0].id]);
    console.log('Administrator role granted to matched provider identity.');
  });
} finally { await db.pool.end(); }
