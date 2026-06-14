// PrivatBank ECR JSON protocol — NULL-terminated framing (0x00 delimiter).
// Normal messages: {json}\x00
// PingDevice handshake only: \x00{json}\x00  (extra leading 0x00 per protocol spec)

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
