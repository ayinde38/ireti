"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmApplied } from "./actions";

export function ConfirmButton({ token, withdrawalId }: { token: string; withdrawalId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="text-right">
      <button
        className="btn btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await confirmApplied(token, withdrawalId);
            if ("error" in r && r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Confirming…" : "Yes, it reached the bill"}
      </button>
      {error && <p className="mt-1 text-[0.85rem] text-clay">{error}</p>}
    </div>
  );
}
