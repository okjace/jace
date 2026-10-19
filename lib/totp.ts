import { Secret, TOTP } from "otpauth";

const ISSUER = "Jace";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotpUri(secretBase32: string, accountName: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: accountName,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return totp.toString();
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const totp = new TOTP({
    issuer: ISSUER,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const delta = totp.validate({ token: code.trim(), window: 1 });
  return delta !== null;
}
