"use client";

import { useActionState } from "react";
import { adminSignIn } from "./actions";

export function AdminSignIn({ demo }: { demo: boolean }) {
  const [s, action, pending] = useActionState(adminSignIn, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-[0.95rem] font-medium">
        Password
        <input name="password" type="password" required className="field mt-1.5" autoComplete="current-password" />
      </label>
      {s?.error && <p role="alert" className="rounded-[20px] bg-clay-soft px-3 py-2 text-[0.9rem]">{s.error}</p>}
      <button className="btn btn-secondary w-full" disabled={pending}>Sign in</button>
      {demo && <p className="text-[0.85rem] text-ink-3">Local default password: ireti-admin</p>}
    </form>
  );
}
