import type { Metadata } from "next";
import { SharedView, sharedMetadata } from "@/components/dashboard/shared-view";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sharedMetadata((await params).token);
}

/** Shared dashboard without the header, for iframes (same as /share/<token>?embed=1). */
export default async function ShareEmbedPage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  return <SharedView token={token} query={query} embed />;
}
