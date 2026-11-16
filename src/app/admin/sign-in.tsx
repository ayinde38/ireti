"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/form-controls";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminSignIn, declineHospital } from "./actions";

export function AdminSignIn({ demo }: { demo: boolean }) {
  const [s, action, pending] = useActionState(adminSignIn, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormField label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </FormField>
      {s?.error && <p role="alert" className="rounded-[14px] bg-clay-soft px-3 py-2 text-[0.9rem]">{s.error}</p>}
      <button className="btn btn-secondary w-full" disabled={pending}>Sign in</button>
      {demo && <p className="text-[0.85rem] text-ink-3">Local default password: ireti-admin</p>}
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
