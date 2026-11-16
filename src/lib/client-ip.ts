import "server-only";

/**
 * The caller's IP, for rate limits. The first X-Forwarded-For entry is
 * whatever the client sent, so it can't be trusted: an attacker could rotate
 * it to dodge every limit. Use the address the hosting proxy saw instead:
 * X-Real-IP (set by Vercel and Railway), else the last X-Forwarded-For entry,
 * which the nearest proxy appended.
 */
export function clientIp(h: Headers) {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return chain?.at(-1) ?? "local";
}
