import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Eyebrow + title + intro used by every landing section. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  text,
  align = "start",
  tone = "default",
  className,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  text?: ReactNode;
  align?: "start" | "center";
  /** "inverted" for sections on a dark panel. */
  tone?: "default" | "inverted";
  className?: string;
}) {
  const inverted = tone === "inverted";
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <p
        className={cn(
          "inline-flex items-center gap-2 text-sm font-semibold tracking-wide",
          inverted ? "text-orange-300" : "text-primary-text",
          align === "center" && "justify-center",
        )}
      >
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60 [animation-duration:2.4s] motion-reduce:animate-none" />
          <span className={cn("relative size-2 rounded-full", inverted ? "bg-orange-400" : "bg-primary")} />
        </span>
        {eyebrow}
      </p>
      <h2 id={id} className={cn("mt-3 text-3xl leading-[1.1] font-bold tracking-tight tall-script:leading-[1.35] tall-script:tracking-normal sm:text-[2.6rem]", inverted && "text-white")}>
        {title}
      </h2>
      {text ? <p className={cn("mt-4 text-lg leading-relaxed", inverted ? "text-white/70" : "text-muted")}>{text}</p> : null}
    </div>
  );
}
