export const satsToNgn = (sats: number, ngnPerBtc: number) => (sats * ngnPerBtc) / 1e8;
export const ngnToSats = (ngn: number, ngnPerBtc: number) => Math.round((ngn / ngnPerBtc) * 1e8);

const ngnFmt = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
const intFmt = new Intl.NumberFormat("en-NG");

export const formatNgn = (n: number) => ngnFmt.format(Math.round(n));
export const formatInt = (n: number) => intFmt.format(Math.round(n));

export function shortHash(h: string | null | undefined) {
  if (!h) return "";
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(iso: string) {
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
