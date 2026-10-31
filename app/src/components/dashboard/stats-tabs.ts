/**
 * The breakdown cards of a stats view and their tabs. A tab is a dimension, optionally
 * narrowed by an extra filter (the "AI assistants" tab is sources in the "ai" channel).
 * Dependency-free: used by server pages, client cards and the data/export routes.
 */

import type { Dimension, Filter } from "@/analytics/types";
import type { MessageKey } from "@/lib/i18n/messages";

export interface StatsTab {
  key: string;
  dimension: Dimension;
  label: MessageKey;
  /** Column header of the main number. */
  metric: MessageKey;
  /** Which number the card shows. */
  value: "visitors" | "visits";
  extraFilter?: Filter;
  /** Tabs of a group share one tab in the card header and are picked with small sub-tabs (UTM). */
  group?: { key: string; label: MessageKey };
}

export interface StatsCard {
  id: "pages" | "sources" | "locations" | "devices" | "conversions";
  title: MessageKey;
  tabs: StatsTab[];
}

const visitors = { metric: "dash.metric.visitors", value: "visitors" } as const;
const utm = { key: "utm", label: "dash.tab.utm" } as const;

export const STATS_CARDS: StatsCard[] = [
  {
    id: "pages",
    title: "dash.card.pages",
    tabs: [
      { key: "page", dimension: "page", label: "dash.tab.topPages", ...visitors },
      { key: "entry_page", dimension: "entry_page", label: "dash.tab.entryPages", metric: "dash.metric.entrances", value: "visits" },
      { key: "exit_page", dimension: "exit_page", label: "dash.tab.exitPages", metric: "dash.metric.exits", value: "visits" },
      { key: "hostname", dimension: "hostname", label: "dash.tab.hostnames", ...visitors },
    ],
  },
  {
    id: "sources",
    title: "dash.card.sources",
    tabs: [
      { key: "channel", dimension: "channel", label: "dash.tab.channels", ...visitors },
      { key: "source", dimension: "source", label: "dash.tab.sources", ...visitors },
      { key: "ai", dimension: "source", label: "dash.tab.ai", ...visitors, extraFilter: { dimension: "channel", op: "is", value: "ai" } },
      { key: "referrer", dimension: "referrer", label: "dash.tab.referrers", ...visitors },
      { key: "utm_medium", dimension: "utm_medium", label: "dash.tab.utmMedium", ...visitors, group: utm },
      { key: "utm_source", dimension: "utm_source", label: "dash.tab.utmSource", ...visitors, group: utm },
      { key: "utm_campaign", dimension: "utm_campaign", label: "dash.tab.utmCampaign", ...visitors, group: utm },
    ],
  },
  {
    id: "locations",
    title: "dash.card.locations",
    tabs: [
      { key: "country", dimension: "country", label: "dash.tab.countries", ...visitors },
      { key: "region", dimension: "region", label: "dash.tab.regions", ...visitors },
      { key: "city", dimension: "city", label: "dash.tab.cities", ...visitors },
    ],
  },
  {
    id: "devices",
    title: "dash.card.devices",
    tabs: [
      { key: "browser", dimension: "browser", label: "dash.tab.browsers", ...visitors },
      { key: "os", dimension: "os", label: "dash.tab.os", ...visitors },
      { key: "device", dimension: "device", label: "dash.tab.devices", ...visitors },
      { key: "screen", dimension: "screen", label: "dash.tab.screens", ...visitors },
      { key: "lang", dimension: "lang", label: "dash.tab.languages", ...visitors },
    ],
  },
  {
    id: "conversions",
    title: "dash.card.conversions",
    tabs: [
      { key: "goal", dimension: "goal", label: "dash.tab.goals", metric: "dash.metric.uniques", value: "visitors" },
      { key: "event", dimension: "event", label: "dash.tab.events", metric: "dash.metric.uniques", value: "visitors" },
    ],
  },
];

const ALL_TABS = new Map(STATS_CARDS.flatMap((c) => c.tabs).map((t) => [t.key, t]));

export function findTab(key: string | null | undefined): StatsTab | undefined {
  return key ? ALL_TABS.get(key) : undefined;
}
