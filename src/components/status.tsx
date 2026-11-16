import type { CampaignStatus } from "@/lib/types";

export function VerifiedBadge({ hospital }: { hospital?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-green-soft px-2.5 py-1 text-[0.8125rem] font-medium text-green">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 1.5 13.5 4v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.6 2.5 11.2 2.5 8V4L8 1.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="m5.5 8 1.8 1.8L10.8 6.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {hospital ? `Bill verified by ${hospital}` : "Hospital verified"}
    </span>
  );
}

export function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <div className="progress-fill" style={{ width: `${Math.max(percent, 1.5)}%` }} />
    </div>
  );
}

const statusCopy: Record<CampaignStatus, { label: string; tone: string }> = {
  pending_verification: { label: "Awaiting hospital", tone: "bg-gold-soft text-gold" },
  live: { label: "Raising", tone: "bg-green-soft text-green" },
  funded: { label: "Goal reached", tone: "bg-green-soft text-green" },
  withdrawn: { label: "Paid to hospital", tone: "bg-green-soft text-green" },
  receipt_posted: { label: "Receipt posted", tone: "bg-green-soft text-green" },
  rejected: { label: "Not verified", tone: "bg-clay-soft text-clay" },
  frozen: { label: "Paused for review", tone: "bg-clay-soft text-clay" },
};

export function StatusPill({ status }: { status: CampaignStatus }) {
  const s = statusCopy[status];
  return (
    <span className={`inline-flex rounded px-2.5 py-0.5 text-[0.8125rem] font-medium ${s.tone}`}>
      {s.label}
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-line bg-paper-2 text-ink-2",
    error: "border-clay/30 bg-clay-soft text-ink",
    success: "border-green/30 bg-green-soft text-ink",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-[0.95rem] ${tones[tone]}`}>
      {children}
    </div>
  );
}
