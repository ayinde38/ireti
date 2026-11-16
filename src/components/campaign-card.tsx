import Link from "next/link";
import type { CampaignView } from "@/lib/campaigns";
import { daysLeft, formatNgn } from "@/lib/format";
import { Progress, StatusPill } from "./ui";

export function CampaignCard({ v }: { v: CampaignView }) {
  const { campaign: c, hospital } = v;
  const open = c.status === "live" || c.status === "funded";
  return (
    <article className="group relative flex min-h-[340px] flex-col rounded-[20px] border border-line bg-white p-6 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="label-mono text-ink-3">{hospital.city}</span>
        {open ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1 text-[0.8rem] font-semibold text-green">
            ✓ Bill verified
          </span>
        ) : (
          <StatusPill status={c.status} />
        )}
      </div>
      <h3 className="mt-5 text-[1.6rem] leading-[1.08] tracking-[-0.035em]">
        <Link href={`/c/${c.slug}`} className="after:absolute after:inset-0">
          {c.title}
        </Link>
      </h3>
      <p className="mt-2 text-[0.92rem] text-ink-3">{hospital.name}</p>
      <p className="mt-4 line-clamp-2 text-[0.95rem] text-ink-2">{c.story.split("\n")[0]}</p>
      <div className="mt-auto pt-6">
        <p className="font-[family-name:var(--font-display)] text-[1.7rem] font-extrabold tracking-[-0.04em]">
          {formatNgn(v.raisedNgn)}
        </p>
        <div className="mt-3">
          <Progress percent={v.percent} label={`${v.percent}% of goal raised`} />
        </div>
        <p className="mt-2.5 flex justify-between text-[0.88rem] text-ink-3">
          <span>of {formatNgn(c.goalNgn)}</span>
          <span>{open ? `${daysLeft(c.deadline)} days left` : `${v.totals.donorCount} donations`}</span>
        </p>
      </div>
    </article>
  );
}
