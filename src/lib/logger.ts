import "server-only";

const sensitiveKeyPattern = /(api[-_]?key|password|secret|token|authorization|cookie|session|credential)/i;

export function logServerEvent(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {}
) {
  const logger = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
  logger(`[investment-app] ${event}`, redact(details));
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    };
  }

  return { message: String(error) };
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted]" : redact(item)
    ])
  );
}
