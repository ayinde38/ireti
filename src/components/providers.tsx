"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={200}>
        {children}
        <LiveSync />
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const CHANNEL = "ireti-changes";

/**
 * Keeps every open page current without a manual refresh. TanStack Query
 * polls a cheap change marker (every few seconds while the tab is visible,
 * and immediately when it regains focus); when the marker moves, the server
 * components re-render in place. Other tabs in the same browser are told
 * at once over a BroadcastChannel, so a change made in one tab shows in all.
 */
function LiveSync() {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const { data } = useQuery({
    queryKey: ["changes"],
    queryFn: async () => {
      const r = await fetch("/api/changes", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      return ((await r.json()) as { marker: string }).marker;
    },
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const bc = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    if (!bc) return;
    bc.onmessage = (e: MessageEvent<string>) => {
      if (e.data !== last.current) {
        last.current = e.data;
        router.refresh();
      }
    };
    return () => bc.close();
  }, [router]);

  useEffect(() => {
    if (!data) return;
    if (last.current !== null && data !== last.current) {
      router.refresh();
      try {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage(data);
        bc.close();
      } catch {
        /* older browsers: polling still covers it */
      }
    }
    last.current = data;
  }, [data, router]);

  return null;
}
