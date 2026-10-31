import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Activity, TrendingDown, TrendingUp, Trash, Unplug, type LucideIcon } from "lucide-react";
import { deleteAlertAction, toggleAlertAction } from "@/app/actions/dashboard/alerts";
import { ActionButton } from "@/components/dashboard/actions";
import { DashHeader, DTable, DTd, DTh, Empty, Panel } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { parseChannelIds, getUserChannels } from "@/lib/channels";
import { formatDateTime } from "@/lib/dash-format";
import { requireDashboardUser } from "@/lib/dashboard";
import { getDb } from "@/lib/db";
import { getLocale, getT } from "@/lib/i18n/server";
import { plural, type MessageKey } from "@/lib/i18n/messages";
import { getOwnedSite } from "@/lib/sites";
import type { TrafficAlertType } from "@/analytics/types";
import { AlertForm } from "./alert-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.alerts.title") };
}

const ICONS: Record<TrafficAlertType, LucideIcon> = { spike: TrendingUp, drop: TrendingDown, silence: Unplug };
const HISTORY_EVENTS = ["traffic_spike", "traffic_drop", "traffic_silence"];

export default async function SiteAlertsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDashboardUser();
  const site = await getOwnedSite(Number((await params).id), user.id);
  if (!site) notFound();
  const db = await getDb();
  const [t, locale, channels, alerts, history] = await Promise.all([
    getT(),
    getLocale(),
    getUserChannels(user.id),
    db.selectFrom("traffic_alerts").selectAll().where("site_id", "=", site.id).orderBy("id").execute(),
    db
      .selectFrom("alert_log")
      .leftJoin("alert_channels", "alert_channels.id", "alert_log.channel_id")
      .select(["alert_log.id", "alert_log.event", "alert_log.ok", "alert_log.error", "alert_log.created_at", "alert_log.channel_id", "alert_channels.name as channel_name"])
      .where("alert_log.site_id", "=", site.id)
      .orderBy("alert_log.id", "desc")
      .limit(50)
      .execute(),
  ]);
  const channelNames = new Map(channels.map((c) => [c.id, c.name]));
  const formChannels = channels.map((c) => ({ id: c.id, name: c.name, type: c.type, isActive: c.isActive }));

  return (
    <>
      <DashHeader title={t("dash.alerts.title")} description={t("dash.alerts.subtitle", { site: site.domain })} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Panel padded={false} title={t("dash.alerts.title")} description={t("dash.alerts.cooldown")}>
            {alerts.length ? (
              <ul className="divide-y divide-line">
                {alerts.map((a) => {
                  const Icon = ICONS[a.type] ?? Activity;
                  const ids = parseChannelIds(a.channel_ids);
                  const names = ids.map((id) => channelNames.get(id)).filter((n): n is string => Boolean(n));
                  return (
                    <li key={a.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start gap-4">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{t(`dash.alerts.type.${a.type}` as MessageKey)}</span>
                            {a.is_active ? null : <Badge tone="warning">{t("dash.alerts.paused")}</Badge>}
                          </div>
                          <p className="mt-0.5 text-sm text-muted">{t(`dash.alerts.summary.${a.type}` as MessageKey, { n: a.threshold })}</p>
                          <p className="mt-1 text-xs text-muted">
                            {names.length ? `${plural(t, "dash.alerts.channelsCount", names.length)}: ${names.join(", ")}` : t("dash.alerts.noChannelSelected")}
                            {" · "}
                            {a.last_triggered_at ? t("dash.alerts.lastTriggered", { date: formatDateTime(a.last_triggered_at, locale.code) }) : t("dash.alerts.neverTriggered")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-start gap-2">
                          <ActionButton action={toggleAlertAction} fields={{ alert_id: a.id, active: a.is_active ? "0" : "1" }}>
                            {a.is_active ? t("dash.alerts.pause") : t("dash.alerts.resume")}
                          </ActionButton>
                          <ActionButton
                            action={deleteAlertAction}
                            fields={{ alert_id: a.id }}
                            confirmText={t("dash.alerts.deleteConfirm")}
                            label={t("dash.alerts.delete")}
                            buttonClassName="hover:border-red-300 hover:text-red-600"
                          >
                            <Trash aria-hidden />
                          </ActionButton>
                        </div>
                      </div>
                      <details className="mt-3 ms-14">
                        <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">{t("dash.alerts.edit")}</summary>
                        <div className="mt-3 max-w-lg">
                          <AlertForm
                            siteId={site.id}
                            channels={formChannels}
                            alert={{ id: a.id, type: a.type, threshold: a.threshold, channelIds: ids, isActive: a.is_active === 1 }}
                          />
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty icon={<Activity />} title={t("dash.alerts.emptyTitle")}>
                {t("dash.alerts.emptyText")}
              </Empty>
            )}
          </Panel>

          <Panel padded={false} title={t("dash.alerts.history")} description={t("dash.alerts.historyText")}>
            {history.length ? (
              <DTable minWidth={560} label={t("dash.alerts.history")}>
                <thead>
                  <tr>
                    <DTh>{t("dash.alerts.col.date")}</DTh>
                    <DTh>{t("dash.alerts.col.alert")}</DTh>
                    <DTh>{t("dash.alerts.col.channel")}</DTh>
                    <DTh>{t("dash.alerts.col.result")}</DTh>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <DTd className="whitespace-nowrap text-muted">{formatDateTime(h.created_at, locale.code)}</DTd>
                      <DTd>{HISTORY_EVENTS.includes(h.event) ? t(`dash.alerts.event.${h.event}` as MessageKey) : h.event}</DTd>
                      <DTd>
                        <span dir="auto">{h.channel_name ?? (h.channel_id ? t("dash.alerts.deletedChannel") : t("dash.alerts.noChannel"))}</span>
                      </DTd>
                      <DTd>
                        {h.ok ? (
                          <Badge tone="success">{t("dash.alerts.delivered")}</Badge>
                        ) : (
                          <span className="inline-flex flex-col items-start gap-1">
                            <Badge tone="danger">{t("dash.alerts.failed")}</Badge>
                            {h.error ? <span className="max-w-72 text-xs text-muted [overflow-wrap:anywhere]">{h.error}</span> : null}
                          </span>
                        )}
                      </DTd>
                    </tr>
                  ))}
                </tbody>
              </DTable>
            ) : (
              <p className="p-5 text-sm text-muted">{t("dash.alerts.historyEmpty")}</p>
            )}
          </Panel>
        </div>

        <Panel title={t("dash.alerts.add")} className="h-fit">
          <AlertForm siteId={site.id} channels={formChannels} />
        </Panel>
      </div>
    </>
  );
}
