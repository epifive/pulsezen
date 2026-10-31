/** Two-letter country code chip (flag emoji don't render on Windows, so codes are used everywhere). */
export function CountryCode({ code }: { code: string }) {
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return (
    <span className="inline-grid h-4 w-6 shrink-0 place-items-center rounded-[3px] border border-line bg-surface font-mono text-[9px] leading-none font-semibold text-muted" aria-hidden>
      {code}
    </span>
  );
}
