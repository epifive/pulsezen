export default function SiteLoading() {
  return (
    <div className="animate-pulse space-y-4 motion-reduce:animate-none" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="h-7 w-48 rounded-lg bg-line/70" />
          <div className="mt-2 h-4 w-32 rounded bg-line/50" />
        </div>
        <div className="h-10 w-56 rounded-lg bg-line/50" />
      </div>
      <div className="rounded-xl border border-line bg-surface">
        <div className="grid grid-cols-2 gap-px border-b border-line sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-2 p-5">
              <div className="h-3 w-16 rounded bg-line/60" />
              <div className="h-6 w-20 rounded bg-line/70" />
            </div>
          ))}
        </div>
        <div className="h-72 p-5">
          <div className="size-full rounded-lg bg-paper" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-80 rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
