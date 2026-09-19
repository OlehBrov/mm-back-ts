// The terminal library works with WIN1251 text (receipts are WIN1251 per the ECRCommX docs).
const EXTRA: Record<number, number> = {
  0x401: 0xa8, // Ё
  0x451: 0xb8, // ё
  0x404: 0xaa, // Є
  0x454: 0xba, // є
  0x406: 0xb2, // І
  0x456: 0xb3, // і
  0x407: 0xaf, // Ї
  0x457: 0xbf, // ї
  0x490: 0xa5, // Ґ
  0x491: 0xb4, // ґ
  0x2116: 0xb9, // №
};

// NUL-terminated WIN1251 bytes; unmappable characters become '?'.
export function encodeCp1251(text: string): Buffer {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code < 0x80) out.push(code);
    else if (code >= 0x410 && code <= 0x44f) out.push(code - 0x350);
    else out.push(EXTRA[code] ?? 0x3f);
  }
  out.push(0);
  return Buffer.from(out);
}
