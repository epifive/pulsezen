"use client";

import { useEffect, useState } from "react";
import { plural } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** "● 12 current visitors" — polls `url` (→ { visitors }) every 15 seconds while the tab is visible. */
export function RealtimeBadge({ url, initial, locale, className }: { url: string; initial: number | null; locale: string; className?: string }) {
  const t = useT();
  const [count, setCount] = useState<number | null>(initial);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as { visitors?: number };
            if (!stopped && typeof body.visitors === "number") setCount(body.visitors);
          }
        } catch {
          // Offline for a moment: keep the last number.
        }
      }
      if (!stopped) timer = setTimeout(load, 15_000);
    };
    timer = setTimeout(load, initial === null ? 0 : 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, initial]);

  const n = count ?? 0;
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", className)} role="status" aria-live="polite">
      <span className="relative flex size-2.5" aria-hidden>
        {n > 0 ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" /> : null}
        <span className={cn("relative inline-flex size-2.5 rounded-full", n > 0 ? "bg-emerald-500" : "bg-line")} />
      </span>
      {count === null ? (
        <span className="text-muted">{t("dash.realtime.loading")}</span>
      ) : (
        <span>{plural(t, "dash.realtime.visitors", n, { n: n.toLocaleString(locale) })}</span>
      )}
    </span>
  );
}
