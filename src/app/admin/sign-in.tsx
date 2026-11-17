"use client";

import { useActionState, useState } from "react";
import { FormField, keepValues } from "@/components/form-controls";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { adminSignIn, declineHospital } from "./actions";

export function AdminSignIn({ demo, reviewerPassword }: { demo: boolean; reviewerPassword?: string }) {
  const [s, action, pending] = useActionState(adminSignIn, undefined);
  const [value, setValue] = useState("");
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5">
      <FormField label="Admin password" htmlFor="password">
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </FormField>
      {s?.error && <p role="alert" className="rounded-[14px] bg-clay-soft px-3.5 py-2.5 text-[0.92rem]">{s.error}</p>}
      <button className="btn btn-secondary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {demo && <p className="text-[0.85rem] text-ink-3">Local default password: ireti-admin</p>}
      {reviewerPassword && (
        <div className="rounded-[20px] border border-sun/60 bg-gold-soft p-5">
          <p className="label-mono text-ink-2">For hackathon reviewers · test network only</p>
          <p className="mt-2 text-[0.95rem] text-ink-2">
            This deploy uses Mutinynet test coins, so the admin password is shared here for judging.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-[10px] bg-white px-3 py-2 font-[family-name:var(--font-mono)] text-[0.92rem]">
              {reviewerPassword}
            </code>
            <button type="button" className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" onClick={() => setValue(reviewerPassword)}>
              Fill it in
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

/** Decline a registration with a reason the hospital sees on its dashboard. */
export function DeclineHospital({ hospitalId }: { hospitalId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        Decline
      </button>
    );
  }
  return (
    <form action={declineHospital} className="w-full space-y-3">
      <input type="hidden" name="hospitalId" value={hospitalId} />
      <FormField label="Reason the hospital will see" htmlFor={`decline-${hospitalId}`}>
        <Textarea id={`decline-${hospitalId}`} name="reason" required maxLength={300} className="min-h-20" placeholder="e.g. The licence number doesn't match the state register." />
      </FormField>
      <div className="flex gap-2">
        <button className="btn btn-ghost !border-clay !text-clay">Decline registration</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
