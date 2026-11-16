import "server-only";
import { campaignView, listPublicCampaigns, takeReserveSnapshot } from "./campaigns";
import { walletKind } from "./lightning";
import { store } from "./store";

const FRESH_MS = 60_000;

/**
 * Proof-of-reserves data: the latest wallet-vs-ledger snapshot (taking a new
 * one if the last is over a minute old, so the page reflects recent payments),
 * plus a per-campaign breakdown that adds up to the ledger total.
 */
export async function transparencyData() {
  let snaps = await store.listSnapshots(48);
  if (!snaps[0] || Date.now() - Date.parse(snaps[0].takenAt) > FRESH_MS) {
    try {
      await takeReserveSnapshot();
      snaps = await store.listSnapshots(48);
    } catch (e) {
      console.error("snapshot failed", e);
    }
  }
  const [ledgerTotalSats, views] = await Promise.all([store.ledgerTotalSats(), listPublicCampaigns()]);
  const frozen = await store.listCampaigns({ status: ["frozen"] });
  const frozenViews = await Promise.all(frozen.map(campaignView));
  const campaigns = [...views, ...frozenViews]
    .filter((v) => v.totals.raisedSats > 0)
    .map((v) => ({
      slug: v.campaign.slug,
      title: v.campaign.title,
      hospital: v.hospital.name,
      status: v.campaign.status,
      raisedSats: v.totals.raisedSats,
      withdrawnSats: v.totals.withdrawnSats,
      heldSats: v.totals.availableSats,
    }))
    .sort((a, b) => b.heldSats - a.heldSats);
  return { ledgerTotalSats, snapshots: snaps, latest: snaps[0] ?? null, wallet: walletKind(), campaigns };
}
