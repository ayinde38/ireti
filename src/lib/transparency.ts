import "server-only";
import { takeReserveSnapshot } from "./campaigns";
import { walletKind } from "./lightning";
import { store } from "./store";

/** Latest proof-of-reserves data; takes a fresh snapshot if the last is over an hour old. */
export async function transparencyData() {
  let snaps = await store.listSnapshots(48);
  const latest = snaps[0];
  if (!latest || Date.now() - Date.parse(latest.takenAt) > 3_600_000) {
    try {
      await takeReserveSnapshot();
      snaps = await store.listSnapshots(48);
    } catch (e) {
      console.error("snapshot failed", e);
    }
  }
  const ledgerTotalSats = await store.ledgerTotalSats();
  return { ledgerTotalSats, snapshots: snaps, latest: snaps[0] ?? null, wallet: walletKind() };
}
