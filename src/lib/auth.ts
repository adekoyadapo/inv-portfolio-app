import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { ensureBootstrapAdmin, getUserByUsername } from "@/lib/elasticsearch";
import { verifyPassword } from "@/lib/passwords";
import type { PublicUser, UserRole } from "@/lib/types";

const cookieName = "investment_admin_session";
const maxAgeSeconds = 60 * 60 * 8;

type Session = {
  username: string;
  role: UserRole;
  issuedAt: number;
};

function sign(value: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function resolveCookieSecure() {
  // This app never terminates TLS itself (no certs mounted, docker-compose maps a plain
  // HTTP port). X-Forwarded-Proto is only present when a TLS-terminating proxy (Dokploy/
  // Traefik) sits in front, so its absence means the request really is plain HTTP -
  // NODE_ENV alone can't tell us that, and using it as a fallback silently drops the
  // session cookie for direct container/LAN-IP access.
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  return forwardedProto?.split(",")[0]?.trim() === "https";
}

export async function createSession(user: PublicUser) {
  const payload = Buffer.from(
    JSON.stringify({
      username: user.username,
      role: user.role,
      issuedAt: Date.now()
    } satisfies Session)
  ).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  const [cookieStore, secure] = await Promise.all([cookies(), resolveCookieSecure()]);

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: maxAgeSeconds
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  if (!safeEqual(signature, sign(payload))) return null;

  const session = parseSession(payload);
  if (!session) return null;

  const age = Date.now() - session.issuedAt;
  if (!Number.isFinite(age) || age > maxAgeSeconds * 1000) return null;

  return {
    username: session.username,
    role: session.role
  };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/dashboard");
  return session;
}

export async function requireAdminOrPortfolioAccess() {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "user_manager" && session.role !== "operator") redirect("/dashboard");
  return session;
}

export async function requireAdminOrUserManager() {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "user_manager") redirect("/dashboard");
  return session;
}

export async function requireAdminOrOperator() {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "operator") redirect("/dashboard");
  return session;
}

export async function validateCredentials(username: string, password: string) {
  await ensureBootstrapAdmin();
  const user = await getUserByUsername(username);
  if (!user) return null;

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export { cookieName };

function parseSession(payload: string): Session | null {
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Session>;
    if (!parsed.username || !parsed.role || !parsed.issuedAt) return null;
    if (parsed.role !== "admin" && parsed.role !== "operator" && parsed.role !== "user_manager" && parsed.role !== "viewer") return null;
    return {
      username: parsed.username,
      role: parsed.role,
      issuedAt: parsed.issuedAt
    };
  } catch {
    return null;
  }
}
