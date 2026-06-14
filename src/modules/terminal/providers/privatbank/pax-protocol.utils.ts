export function buildFramedMessage(jsonString: string): Buffer {
  const dataBuf = Buffer.from(jsonString, 'utf8');
  const len = dataBuf.length;
  const stx = Buffer.from([0x02]);
  const header = Buffer.from([0x66, 0x01, (len >> 8) & 0xff, len & 0xff]);

  let lrc = 0;
  for (const b of dataBuf) lrc ^= b;
  lrc &= 0xff;

  return Buffer.concat([stx, header, dataBuf, Buffer.from([lrc])]);
}

export interface ParseResult {
  parsed: Record<string, unknown>;
  consumed: number;
}

export function parseFramedBuffer(buf: Buffer): ParseResult | null {
  if (buf.length < 4) return null;

  const stxIdx = buf.indexOf(0x02);
  if (stxIdx === -1) return null;
  const slice = stxIdx > 0 ? buf.subarray(stxIdx) : buf;
  if (slice.length < 4) return null;

  let headerLen = 2;
  let len = 0;

  if (slice[1] === 0x66) {
    if (slice.length < 4) return null;
    headerLen = 4;
    len = slice.readUInt16BE(3);
  } else {
    len = slice.readUInt16BE(1);
  }

  const frameTotal = 1 + headerLen + len + 1;
  if (slice.length < frameTotal) return null;

  const dataStart = 1 + headerLen;
  const dataBuf = slice.subarray(dataStart, dataStart + len);
  const lrc = slice[dataStart + len];

  let calc = 0;
  for (let i = 0; i < dataBuf.length; i++) calc ^= dataBuf[i];

  if ((calc & 0xff) !== (lrc & 0xff)) {
    return { parsed: {}, consumed: stxIdx + 1 }; // drop this STX, retry
  }

  try {
    const parsed = JSON.parse(dataBuf.toString('utf8')) as Record<string, unknown>;
    return { parsed, consumed: stxIdx + frameTotal };
  } catch {
    return { parsed: {}, consumed: stxIdx + 1 };
  }
}
