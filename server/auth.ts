import crypto from "node:crypto";

/**
 * PASSORD-HASHING
 * ===============
 * Bruker Node sin innebygde scrypt (ingen ekstra avhengighet trengs,
 * i motsetning til bcrypt) - hvert passord far et eget tilfeldig salt,
 * lagret sammen med hashen som "salt:hash" i users.password_hash.
 * timingSafeEqual brukes ved verifisering for a unnga timing-angrep.
 */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = String(stored ?? "").split(":");
  if (!salt || !hash) return false;

  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const hashBuf = Buffer.from(hash, "hex");
  const checkBuf = Buffer.from(check, "hex");
  if (hashBuf.length !== checkBuf.length) return false;

  return crypto.timingSafeEqual(hashBuf, checkBuf);
}
