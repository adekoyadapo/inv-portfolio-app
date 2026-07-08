import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, keyLength)) as Buffer;
  return `scrypt$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, encodedKey] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !encodedKey) return false;

  const key = (await scrypt(password, salt, keyLength)) as Buffer;
  const storedKey = Buffer.from(encodedKey, "base64url");
  return key.length === storedKey.length && timingSafeEqual(key, storedKey);
}
