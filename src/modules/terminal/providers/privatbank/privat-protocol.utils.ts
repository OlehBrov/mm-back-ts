// PrivatBank ECR JSON protocol — NULL-terminated framing (0x00 delimiter).
// Normal messages sent:    {json}\x00
// PingDevice sent:         \x00{json}\x00  (extra leading 0x00 per protocol spec)
// Terminal responses:      {json}  (NO null terminator — NEWLAND N950 behaviour)

export interface ParseResult {
  parsed: Record<string, unknown>;
  consumed: number;
}

export function buildPrivatMessage(jsonString: string): Buffer {
  return Buffer.concat([Buffer.from(jsonString, 'utf8'), Buffer.from([0x00])]);
}

// PingDevice requires an extra leading 0x00 (handshake marker).
export function buildPrivatHandshake(jsonString: string): Buffer {
  return Buffer.concat([Buffer.from([0x00]), Buffer.from(jsonString, 'utf8'), Buffer.from([0x00])]);
}

export function parseNullTerminatedBuffer(buf: Buffer): ParseResult | null {
  const nullIdx = buf.indexOf(0x00);
  if (nullIdx === -1) return null;

  try {
    const parsed = JSON.parse(buf.subarray(0, nullIdx).toString('utf8')) as Record<string, unknown>;
    return { parsed, consumed: nullIdx + 1 };
  } catch {
    // Garbage before delimiter — skip past it and retry.
    return { parsed: {}, consumed: nullIdx + 1 };
  }
}

// Fallback for terminals (e.g. NEWLAND N950) that respond with raw JSON and no \x00 delimiter.
// Finds the first complete JSON object by tracking brace depth.
export function parseRawJsonBuffer(buf: Buffer): ParseResult | null {
  if (buf.length === 0 || buf[0] !== 0x7b /* { */) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (c === 0x5c /* \ */) escaped = true;
      else if (c === 0x22 /* " */) inString = false;
      continue;
    }
    if (c === 0x22 /* " */) { inString = true; continue; }
    if (c === 0x7b /* { */) { depth++; }
    else if (c === 0x7d /* } */) {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(buf.subarray(0, i + 1).toString('utf8')) as Record<string, unknown>;
          return { parsed, consumed: i + 1 };
        } catch {
          return null;
        }
      }
    }
  }
  return null; // incomplete JSON — wait for more data
}
