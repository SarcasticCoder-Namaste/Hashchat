import { createHmac, randomBytes, createHash } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

export function verifyTotp(
  secretBase32: string,
  code: string,
  windowSteps = 1,
  stepSeconds = 30,
): boolean {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let i = -windowSteps; i <= windowSteps; i++) {
    if (hotp(secret, counter + i) === cleaned) return true;
  }
  return false;
}

export function buildOtpauthUrl(
  label: string,
  secretBase32: string,
  issuer = "HashChat",
): string {
  const enc = (s: string) => encodeURIComponent(s);
  return `otpauth://totp/${enc(issuer)}:${enc(label)}?secret=${secretBase32}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBackupCodes(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let s = "";
    const buf = randomBytes(8);
    for (const b of buf) s += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
    out.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return out;
}

export function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
}

export function generateEmailOtp(): string {
  const buf = randomBytes(4);
  const n = buf.readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function hashEmailOtp(code: string): string {
  return createHash("sha256")
    .update(code.replace(/\s+/g, ""))
    .digest("hex");
}

export function consumeBackupCode(
  code: string,
  hashes: string[],
): { ok: boolean; remaining: string[] } {
  const wanted = hashBackupCode(code);
  const idx = hashes.indexOf(wanted);
  if (idx < 0) return { ok: false, remaining: hashes };
  const remaining = hashes.slice(0, idx).concat(hashes.slice(idx + 1));
  return { ok: true, remaining };
}
