import { z } from 'zod';
export const uuid = z.uuid();
export const productInput = z.object({
  name: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(10000),
  kind: z.enum(['product','service']), price_minor: z.number().int().min(1).max(99999999),
  currency: z.enum(['USD','EUR','GBP']), status: z.enum(['draft','published','unavailable','archived']),
  merchant_id: uuid, fulfillment_method: z.enum(['manual','none']), requirements: z.string().trim().max(4000)
}).strict().refine(p => p.status !== 'published' || (p.fulfillment_method === 'manual' && p.requirements.length > 0), { message: 'Published listings require manual fulfillment and delivery requirements.' });
export const merchantInput = z.object({name: z.string().trim().min(1).max(120), contact_email: z.email().max(254), verified: z.boolean(), active: z.boolean()}).strict();
export const tokenInput = z.object({
  name: z.string().trim().max(100), symbol: z.string().trim().max(20),
  contract: z.union([z.literal(''),z.string().regex(/^0x[a-fA-F0-9]{40}$/)]),
  chain_id: z.union([z.literal(''),z.string().regex(/^[1-9]\d{0,14}$/)]),
  explorer_url: z.union([z.literal(''),z.url().refine(s => s.startsWith('https://'))])
}).strict();
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw Object.assign(new Error(result.error.issues.map(i => i.message).join(' ')), { status: 400, code: 'INVALID_INPUT' });
  return result.data;
}
export function fail(status, code, message) { throw Object.assign(new Error(message), { status, code }); }
