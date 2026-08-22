/**
 * The minimum of protobuf needed to talk to Google Travel.
 *
 * Both products encode their entire query into one base64url protobuf — `tfs` for
 * Flights, `ts` for Hotels. Nothing else in the URL is load-bearing: on Hotels,
 * `?checkin=…&checkout=…` is accepted and then silently ignored, so a search
 * built by string concatenation returns prices for the wrong dates and looks
 * perfectly fine while doing it.
 *
 * Only two wire types are needed — varint (0) and length-delimited (2) — so this
 * is a few dozen lines rather than a dependency. The reader exists so encoders
 * can be tested by round-tripping against real captured URLs, which is the only
 * way to be sure a query means what we think it means.
 */

/** A protobuf message as a plain tree. Repeated fields are arrays. */
export type PbValue = number | bigint | string | Uint8Array | PbMessage;
export type PbMessage = { [field: number]: PbValue | PbValue[] };

/* ────────────────────────────── encoding ────────────────────────────── */

function encodeVarint(value: number | bigint, out: number[]): void {
  let v = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  // Negative numbers are two's complement over 64 bits — Google uses this for
  // "no maximum price" (field 16 of `tfs` is -1, i.e. 0xFFFF…FF).
  if (v < 0n) v += 1n << 64n;
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
}

function encodeKey(field: number, wireType: number, out: number[]): void {
  encodeVarint(field * 8 + wireType, out);
}

function encodeValue(field: number, value: PbValue, out: number[]): void {
  if (typeof value === 'number' || typeof value === 'bigint') {
    encodeKey(field, 0, out);
    encodeVarint(value, out);
    return;
  }

  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof Uint8Array
        ? value
        : encodeMessage(value);

  encodeKey(field, 2, out);
  encodeVarint(bytes.length, out);
  out.push(...bytes);
}

export function encodeMessage(message: PbMessage): Uint8Array {
  const out: number[] = [];
  // Numeric keys iterate in ascending order in JS, which happens to be the field
  // order Google emits. Repeated fields keep their array order.
  for (const key of Object.keys(message)) {
    const field = Number(key);
    const value = message[field];
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      encodeValue(field, item, out);
    }
  }
  return Uint8Array.from(out);
}

/* ────────────────────────────── decoding ────────────────────────────── */

function decodeVarint(bytes: Uint8Array, offset: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let i = offset;
  for (;;) {
    const byte = bytes[i];
    if (byte === undefined) throw new Error('protobuf: truncated varint');
    i += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, i];
    shift += 7n;
    if (shift > 63n) throw new Error('protobuf: varint too long');
  }
}

/**
 * Decode into a plain tree.
 *
 * Length-delimited fields are ambiguous on the wire — a nested message and a
 * string look identical — so this tries to parse them as a message and falls
 * back to text. That is a heuristic, and it is fine for the one job it has:
 * reading a captured URL to learn its shape.
 */
export function decodeMessage(bytes: Uint8Array): PbMessage {
  const message: PbMessage = {};
  let i = 0;

  const put = (field: number, value: PbValue): void => {
    const existing = message[field];
    if (existing === undefined) message[field] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else message[field] = [existing, value];
  };

  while (i < bytes.length) {
    const [key, afterKey] = decodeVarint(bytes, i);
    const field = Number(key >> 3n);
    const wireType = Number(key & 7n);
    i = afterKey;

    if (wireType === 0) {
      const [value, next] = decodeVarint(bytes, i);
      i = next;
      put(field, value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value);
    } else if (wireType === 2) {
      const [length, afterLength] = decodeVarint(bytes, i);
      const end = afterLength + Number(length);
      const chunk = bytes.subarray(afterLength, end);
      i = end;
      put(field, sniff(chunk));
    } else if (wireType === 5) {
      i += 4;
    } else if (wireType === 1) {
      i += 8;
    } else {
      throw new Error(`protobuf: unsupported wire type ${wireType}`);
    }
  }

  return message;
}

/** Is this chunk printable text, a nested message, or neither? */
function sniff(chunk: Uint8Array): PbValue {
  if (chunk.length === 0) return {};

  const printable = chunk.every((c) => c === 0x0a || c === 0x0d || c === 0x09 || (c >= 0x20 && c < 0x7f));
  if (printable) return new TextDecoder().decode(chunk);

  try {
    return decodeMessage(chunk);
  } catch {
    return chunk;
  }
}

/**
 * Read a field as a list.
 *
 * On the wire a repeated field holding one item is indistinguishable from a
 * singular field, so the decoder returns a bare value in that case. Anything
 * reading a repeated field — flight slices, passenger types — must go through
 * here, or a one-way search looks like it has no slices at all.
 */
export function asList(value: PbValue | PbValue[] | undefined): PbValue[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/* ──────────────────────────── base64url glue ─────────────────────────── */

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

/** Build the URL parameter Google expects, in one step. */
export function encodeParam(message: PbMessage): string {
  return toBase64Url(encodeMessage(message));
}

export function decodeParam(value: string): PbMessage {
  return decodeMessage(fromBase64Url(value));
}
