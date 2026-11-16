"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { startCampaign, type StartState } from "./actions";

function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[0.95rem] font-medium">
        {label}
      </label>
      {hint && <p id={`${name}-hint`} className="mt-0.5 text-[0.85rem] text-ink-3">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[0.88rem] text-clay">
          {error}
        </p>
      )}
    </div>
  );
}

export function StartForm({ hospitals }: { hospitals: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startCampaign, { ok: false });
  const [copied, setCopied] = useState(false);

  if (state.ok) {
    return (
      <div className="mt-10 rounded-[20px] border border-green/30 bg-green-soft p-6">
        <h2 className="text-[1.6rem]">Sent to {state.hospitalName}</h2>
        <p className="mt-2 text-ink-2">
          Their billing office will check the bill. Once they confirm it, your campaign goes live
          and you can share it.
        </p>
        <div className="mt-6 rounded-md border border-line bg-card p-4">
          <p className="text-[0.95rem] font-medium">Your private family link</p>
          <p className="mt-1 text-[0.88rem] text-ink-3">
            Save it now. It shows every donation and withdrawal, and lets you confirm when money
            reaches the bill. We have also emailed it to you.
          </p>
          <p className="hash mt-3 rounded-[20px] bg-paper-2 p-3">{state.familyUrl}</p>
          <button
            className="btn btn-ghost mt-3"
            onClick={async () => {
              await navigator.clipboard.writeText(state.familyUrl);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <Link href={state.familyUrl.replace(/^https?:\/\/[^/]+/, "")} className="btn btn-secondary mt-6">
          Open family page
        </Link>
      </div>
    );
  }

  const e = state.errors ?? {};
  const v = state.values ?? {};
  const aria = (n: string) =>
    e[n] ? { "aria-invalid": true, "aria-describedby": `${n}-error` } : {};

  return (
    <form action={action} className="mt-10 space-y-6" noValidate>
      {state.message && (
        <p role="alert" className="rounded-[20px] bg-clay-soft px-4 py-3 text-[0.95rem]">{state.message}</p>
      )}
      <fieldset className="space-y-5">
        <legend className="text-[1.35rem]">About you</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" name="campaignerName" error={e.campaignerName}>
            <input id="campaignerName" name="campaignerName" className="field" defaultValue={v.campaignerName} autoComplete="name" {...aria("campaignerName")} />
          </Field>
          <Field label="Your email" name="campaignerEmail" error={e.campaignerEmail}>
            <input id="campaignerEmail" name="campaignerEmail" type="email" className="field" defaultValue={v.campaignerEmail} autoComplete="email" {...aria("campaignerEmail")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-6">
        <legend className="text-[1.35rem]">The bill</legend>
        <Field label="Hospital" name="hospitalId" error={e.hospitalId}>
          <select id="hospitalId" name="hospitalId" className="field" defaultValue={v.hospitalId ?? ""} {...aria("hospitalId")}>
            <option value="" disabled>Choose a partner hospital</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Bill or invoice number" name="billReference" hint="As printed on the hospital's bill." error={e.billReference}>
            <input id="billReference" name="billReference" className="field" defaultValue={v.billReference} {...aria("billReference")} />
          </Field>
          <Field label="Amount needed (₦)" name="goalNgn" hint="The total on the bill." error={e.goalNgn}>
            <input id="goalNgn" name="goalNgn" inputMode="numeric" className="field" defaultValue={v.goalNgn} {...aria("goalNgn")} />
          </Field>
        </div>
        <Field label="How long should it run?" name="days">
          <select id="days" name="days" className="field" defaultValue={v.days ?? "30"}>
            <option value="14">2 weeks</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
          </select>
        </Field>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-6">
        <legend className="text-[1.35rem]">The story</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name to show" name="patientDisplayName" hint="First name or a nickname." error={e.patientDisplayName}>
            <input id="patientDisplayName" name="patientDisplayName" className="field" defaultValue={v.patientDisplayName} {...aria("patientDisplayName")} />
          </Field>
          <Field label="Campaign title" name="title" hint="e.g. Help Amara get heart surgery" error={e.title}>
            <input id="title" name="title" className="field" defaultValue={v.title} {...aria("title")} />
          </Field>
        </div>
        <Field
          label="Tell donors what's happening"
          name="story"
          hint="Who they are, what care they need, and why now. No need to share medical details you'd rather keep private."
          error={e.story}
        >
          <textarea id="story" name="story" className="field" rows={7} defaultValue={v.story} {...aria("story")} />
        </Field>
      </fieldset>

      <div className="border-t border-line pt-6">
        <label className="flex gap-3 text-[0.95rem]">
          <input type="checkbox" name="consent" className="mt-1 h-5 w-5 shrink-0 accent-[var(--green)]" defaultChecked={v.consent === "on"} />
          <span>
            The patient (or their parent or guardian) has agreed to this campaign and to the story
            above being public.
          </span>
        </label>
        {e.consent && <p className="mt-1.5 text-[0.88rem] text-clay">{e.consent}</p>}
      </div>

      <button type="submit" disabled={pending} className="btn btn-secondary w-full sm:w-auto">
        {pending ? "Sending…" : "Send to the hospital for checking"}
      </button>
    </form>
  );
}
