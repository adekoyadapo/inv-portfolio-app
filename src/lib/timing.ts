export async function withMinDuration<T>(fn: () => Promise<T>, minMs: number): Promise<T> {
  const startedAt = Date.now();
  const result = await fn();
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}
