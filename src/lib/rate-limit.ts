/**
 * Small fixed-window limiter, per process. Good enough to stop a single
 * client spamming invoices; put Vercel Firewall rate limiting in front for
 * production traffic.
 */
const g = globalThis as unknown as { __iretiRl?: Map<string, { n: number; reset: number }> };
const buckets = (g.__iretiRl ??= new Map());

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}
