import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp } from "@/lib/client-ip";
import { canDonate } from "@/lib/campaigns";
import { invoiceMatchesNetwork, lightning } from "@/lib/lightning";
import { rateLimit } from "@/lib/rate-limit";
import { store } from "@/lib/store";

const Body = z.object({
  amountSats: z.number().int().min(100).max(50_000_000),
  donorName: z.string().trim().max(60).optional().nullable(),
  message: z.string().trim().max(280).optional().nullable(),
  donorEmail: z.string().trim().pipe(z.email().max(200)).optional().nullable(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/campaigns/[slug]/donations">) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`invoice:${ip}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
  }

  const { slug } = await ctx.params;
  const campaign = await store.getCampaignBySlug(slug);
  if (!campaign || !canDonate(campaign)) {
    return NextResponse.json({ error: "This campaign is not accepting donations." }, { status: 404 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the amount (at least 100 sats) and email address." }, { status: 400 });
  }
  const { amountSats, donorName, message, donorEmail } = parsed.data;

  try {
    const inv = await lightning().createInvoice(
      amountSats,
      `Ireti: ${campaign.title} (${campaign.billReference})`,
    );
    if (!invoiceMatchesNetwork(inv.paymentRequest)) {
      throw new Error("Wallet is on a different network than LIGHTNING_NETWORK says");
    }
    const donation = await store.createDonation({
      campaignId: campaign.id,
      amountSats,
      paymentHash: inv.paymentHash,
      paymentRequest: inv.paymentRequest,
      donorName: donorName || null,
      message: message || null,
      donorEmail: donorEmail || null,
      expiresAt: inv.expiresAt,
    });
    return NextResponse.json({
      id: donation.id,
      paymentRequest: inv.paymentRequest,
      paymentHash: inv.paymentHash,
      expiresAt: inv.expiresAt,
    });
  } catch (err) {
    console.error("createInvoice failed", err);
    return NextResponse.json(
      { error: "We couldn't create a payment request just now. Please try again." },
      { status: 502 },
    );
  }
}
