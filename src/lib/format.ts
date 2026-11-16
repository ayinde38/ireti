export const satsToFiat = (sats: number, fiatPerBtc: number) => (sats * fiatPerBtc) / 1e8;
export const fiatToSats = (amount: number, fiatPerBtc: number) => Math.round((amount / fiatPerBtc) * 1e8);

/**
 * Symbols people use locally and can't confuse with another currency. Anything
 * else shows its ISO code ("EGP 5,000"): Intl's narrow symbols are uneven
 * across Africa (E£, a bare "$" for Liberian and Namibian dollars, "£" for
 * South Sudan), and a code is never ambiguous.
 */
const SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GHS: "GH₵",
  KES: "KSh",
  ZAR: "R",
  XOF: "CFA",
  XAF: "FCFA",
};
/** Single-glyph symbols sit against the number; longer labels get a space. */
const tight = (label: string) => [...label].length === 1;

const numFmt = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
/** "₦500,000", "KSh 2,000", "EGP 5,000": whole units, in the campaign's currency. */
export function formatMoney(amount: number, currency: string) {
  const label = currencySymbol(currency);
  const n = Math.round(amount);
  const body = numFmt.format(Math.abs(n));
  return `${n < 0 ? "−" : ""}${label}${tight(label) ? "" : " "}${body}`;
}
/** The currency's symbol (or code) alone, for input prefixes. */
export function currencySymbol(currency: string) {
  const code = currency.toUpperCase();
  return SYMBOLS[code] ?? code;
}

const intFmt = new Intl.NumberFormat("en");
export const formatInt = (n: number) => intFmt.format(Math.round(n));

export function shortHash(h: string | null | undefined) {
  if (!h) return "";
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function timeAgo(iso: string) {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Recent things read as "5 minutes ago"; anything over a week old as a date. */
export function formatWhen(iso: string) {
  return Date.now() - Date.parse(iso) < 7 * 86_400_000 ? timeAgo(iso) : formatDate(iso);
}

/** The exact moment, for a tooltip on a relative time. */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
