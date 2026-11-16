import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Lightning addresses are typed in by hospitals, and the server fetches the
 * URLs they lead to. Refuse anything that points inside our own network
 * (localhost, cloud metadata, private ranges), so a registration can't be
 * used to make Ireti's server call internal services.
 */
function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) {
      // IPv4-mapped: "::ffff:127.0.0.1", or as URL parsing writes it, "::ffff:7f00:1".
      const rest = v.slice(7);
      if (rest.includes(".")) return isPrivate(rest);
      const [hi, lo] = rest.split(":").map((x) => parseInt(x, 16));
      return isPrivate([hi >> 8, hi & 255, lo >> 8, lo & 255].join("."));
    }
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Throws unless `url` is https on a host that resolves only to public addresses. */
export async function assertPublicHttps(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (u.protocol !== "https:") throw new Error("Only https is allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivate(a.address))) {
    throw new Error("Host is not on the public internet");
  }
}

export const assertPublicLightningAddress = (address: string) =>
  assertPublicHttps(`https://${address.split("@")[1] ?? ""}/`);
