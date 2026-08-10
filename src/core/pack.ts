/**
 * Binary packing for the lower-timeframe resolution path.
 *
 * A chart's reveal window is 60 display bars, which is 3600 one-minute bars. As JSONB that is
 * roughly 150-250 KB per chart, and a thousand-chart corpus would consume most of a 500 MB
 * database on its own. Packed as Float32 OHLC it is 57.6 KB, so the same corpus costs about
 * 58 MB before TOAST compression.
 *
 * Float32 carries about seven significant digits. Prices are indexed to a base of 100 and the
 * tick is 0.01, so the representation error is four orders of magnitude below the tick. It is
 * also stable: the packed bytes are what the resolver always reads, so re-resolving a stored
 * round reproduces its result exactly.
 */

import type { Bar } from './bars';

const FIELDS_PER_BAR = 4;

/** Pack prices as interleaved Float32 [o, h, l, c]. Volume is not carried. */
export function packPath(bars: Bar[]): Uint8Array {
  const floats = new Float32Array(bars.length * FIELDS_PER_BAR);
  for (let i = 0; i < bars.length; i++) {
    const base = i * FIELDS_PER_BAR;
    floats[base] = bars[i].o;
    floats[base + 1] = bars[i].h;
    floats[base + 2] = bars[i].l;
    floats[base + 3] = bars[i].c;
  }
  return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
}

/** Inverse of packPath. Volume comes back as zero; the resolver does not use it. */
export function unpackPath(bytes: Uint8Array): Bar[] {
  // The source may be a view into a larger buffer at a non-multiple-of-4 offset, which
  // Float32Array will not accept, so copy into a fresh aligned buffer.
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  const floats = new Float32Array(aligned.buffer);

  const count = Math.floor(floats.length / FIELDS_PER_BAR);
  const bars: Bar[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * FIELDS_PER_BAR;
    bars[i] = {
      o: floats[base],
      h: floats[base + 1],
      l: floats[base + 2],
      c: floats[base + 3],
      v: 0,
    };
  }
  return bars;
}

/** Encode for a Postgres bytea column in hex format. */
export function toPgHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `\\x${hex}`;
}

/** Decode the hex format PostgREST returns for a bytea column. */
export function fromPgHex(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const DETAIL_FIELDS_PER_BAR = 5;

/**
 * Pack bars with volume, for the client-side detail series.
 *
 * The resolver's path (packPath above) carries no volume because it does not read one. The
 * detail path does, because at 1-minute zoom the volume histogram is showing minute volume and
 * fabricating it would be exactly the kind of plausible-looking invention §1.1 rejects.
 */
export function packDetail(bars: Bar[]): Uint8Array {
  const floats = new Float32Array(bars.length * DETAIL_FIELDS_PER_BAR);
  for (let i = 0; i < bars.length; i++) {
    const base = i * DETAIL_FIELDS_PER_BAR;
    floats[base] = bars[i].o;
    floats[base + 1] = bars[i].h;
    floats[base + 2] = bars[i].l;
    floats[base + 3] = bars[i].c;
    floats[base + 4] = bars[i].v;
  }
  return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
}

export function unpackDetail(bytes: Uint8Array): Bar[] {
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  const floats = new Float32Array(aligned.buffer);

  const count = Math.floor(floats.length / DETAIL_FIELDS_PER_BAR);
  const bars: Bar[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * DETAIL_FIELDS_PER_BAR;
    bars[i] = {
      o: floats[base],
      h: floats[base + 1],
      l: floats[base + 2],
      c: floats[base + 3],
      v: floats[base + 4],
    };
  }
  return bars;
}

/** Bytes per packed detail bar. Used to slice the lead-in half server-side. */
export const DETAIL_BAR_BYTES = DETAIL_FIELDS_PER_BAR * 4;

/**
 * Base64, for shipping a packed series to the browser.
 *
 * Postgres hands bytea back as hex, which doubles the payload; base64 costs a third instead.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000; // avoid blowing the argument limit on large paths
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64')
    : btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* -------------------------------------------------------- achievable set */

/** Pack a plain series of numbers as Float32 — the 98 R-multiples of the achievable grid. */
export function packFloats(values: readonly number[]): Uint8Array {
  const floats = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) floats[i] = values[i];
  return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
}

export function unpackFloats(bytes: Uint8Array): number[] {
  const aligned = new Uint8Array(bytes.byteLength);
  aligned.set(bytes);
  return Array.from(new Float32Array(aligned.buffer));
}

/** Outcome codes for a stored grid cell. The high bit flags an ambiguous fill (§12.3.2). */
export const OUTCOME_CODE = { stop: 0, target: 1, timeout: 2 } as const;
export const AMBIGUOUS_FLAG = 0x80;
