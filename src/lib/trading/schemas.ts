/**
 * The requests a trading session accepts, checked at the boundary.
 *
 * Prices arrive in real units and quantities in base units or USDT; the session core converts them
 * to the simulator's ticks and steps. There is no field for the minute an order is placed at —
 * that is the server's to say (§17.5).
 */

import { z } from 'zod';
import { REPLAY_SPEEDS } from '@/core/trading/clock';

const price = z.number().finite().positive();
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'order ids are letters, digits, _ and -');

export const placeSchema = z
  .object({
    op: z.literal('place'),
    clientOrderId: id,
    side: z.enum(['buy', 'sell']),
    type: z.enum(['market', 'limit', 'stop']),
    /** Base units, e.g. 0.25 BTC. */
    qty: z.number().finite().positive().optional(),
    /** Or USDT of notional. */
    notional: z.number().finite().positive().optional(),
    price: price.optional(),
    stopPrice: price.optional(),
    reduceOnly: z.boolean().optional(),
    takeProfit: price.optional(),
    stopLoss: price.optional(),
  })
  .refine((body) => (body.qty === undefined) !== (body.notional === undefined), {
    message: 'give a quantity or a notional, not both',
  })
  .refine((body) => body.type !== 'limit' || body.price !== undefined, { message: 'a limit order needs a price' })
  .refine((body) => body.type !== 'stop' || body.stopPrice !== undefined, { message: 'a stop order needs a stop price' });

export const opSchema = z.union([
  z.object({ op: z.literal('tick') }),
  placeSchema,
  z.object({
    op: z.literal('modify'),
    orderId: id.or(z.string().regex(/^[A-Za-z0-9_-]+:(tp|sl)$/)),
    price: price.optional(),
    stopPrice: price.optional(),
    qty: z.number().finite().positive().optional(),
  }),
  z.object({ op: z.literal('cancel'), orderId: z.string().min(1).max(80) }),
  z.object({ op: z.literal('cancel-all') }),
  z.object({ op: z.literal('close-position'), fraction: z.union([z.literal(0.25), z.literal(0.5), z.literal(1)]) }),
  z.object({ op: z.literal('play') }),
  z.object({ op: z.literal('pause') }),
  z.object({
    op: z.literal('speed'),
    speed: z.number().refine((value) => (REPLAY_SPEEDS as readonly number[]).includes(value), 'not a replay speed'),
  }),
  z.object({ op: z.literal('step'), minutes: z.number().int().min(1).max(1440) }),
  z.object({ op: z.literal('end') }),
]);

export type SessionOp = z.infer<typeof opSchema>;
export type PlaceOp = z.infer<typeof placeSchema>;

export const requestSchema = z.object({
  /** Tape minutes the client already holds. Bars before this are not resent. */
  since: z.number().int().min(0),
  op: opSchema,
});

export type SessionRequest = z.infer<typeof requestSchema>;

export const openSchema = z.object({
  market: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('random') }),
    z.object({ kind: z.literal('pair'), symbol: z.string().regex(/^[A-Z0-9]{2,20}$/) }),
    z.object({ kind: z.literal('daily') }),
    z.object({ kind: z.literal('scenario'), slug: z.string().regex(/^[a-z0-9-]{2,60}$/) }),
  ]),
  account: z.enum(['main', 'practice']).default('main'),
  showDates: z.boolean().optional(),
});

export type OpenRequest = z.infer<typeof openSchema>;
