import Link from "next/link";
import { cn } from "@/lib/utils";

/** Default brand mark: rising bars with a live "pulse" dot. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <rect x="7" y="17" width="4" height="8" rx="1.5" fill="white" opacity="0.75" />
      <rect x="14" y="12" width="4" height="13" rx="1.5" fill="white" opacity="0.9" />
      <rect x="21" y="8" width="4" height="17" rx="1.5" fill="white" />
      <circle cx="25.5" cy="6.5" r="3.2" fill="#fbbf24" stroke="var(--primary)" strokeWidth="1.5" />
    </svg>
  );
}

export function Logo({
  siteName,
  logo,
  logoDark,
  href = "/",
  className,
}: {
  siteName: string;
  logo?: string;
  logoDark?: string;
  href?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label={`${siteName} home`}>
      {logo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo of unknown size */}
          <img src={logo} alt={siteName} className={cn("h-8 w-auto max-w-full object-contain object-left rtl:object-right", logoDark && "dark:hidden")} />
          {logoDark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDark} alt={siteName} className="hidden h-8 w-auto max-w-full object-contain object-left dark:block rtl:object-right" />
          ) : null}
        </>
      ) : (
        <>
          <BrandMark className="shrink-0" />
          <span className="truncate font-display text-xl font-bold tracking-tight text-ink">{siteName}</span>
        </>
      )}
    </Link>
  );
}
