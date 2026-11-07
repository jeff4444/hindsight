import { z } from 'zod';

/** What the browser may send. Prices are real, sizes USDT; the server converts and checks both. */

const price = z.number().finite().positive();

export const intentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sit-out') }),
  z.object({
    kind: z.literal('trade'),
    side: z.enum(['buy', 'sell']),
    type: z.enum(['market', 'limit', 'stop']),
    size: z.number().finite().positive(),
    price: price.optional(),
    takeProfit: price.optional(),
    stopLoss: price.optional(),
  }),
]);

export const lockSchema = z.object({ intent: intentSchema });

export const dealSchema = z.object({ mode: z.literal('training') });

export const duelCreateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player') }),
  z.object({ kind: z.literal('school'), school: z.string().min(1).max(64) }),
]);

export const duelActionSchema = z.object({ action: z.enum(['join', 'play']) });
