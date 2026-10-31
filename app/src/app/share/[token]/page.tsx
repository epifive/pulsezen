import type { Metadata } from "next";
import { SharedView, sharedMetadata } from "@/components/dashboard/shared-view";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sharedMetadata((await params).token);
}

/** Public shared dashboard. `?embed=1` hides the header for iframes. */
export default async function SharePage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  return <SharedView token={token} query={query} embed={query.embed === "1"} />;
}
