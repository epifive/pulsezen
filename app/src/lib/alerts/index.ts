import "server-only";
import { getDb } from "@/lib/db";
import { getActiveChannels, logAlert, type ChannelRecord } from "@/lib/channels";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";
import type { AlertEvent, AlertPayload, ChannelConfigByType } from "@/analytics/types";
import { sendDiscord } from "./discord";
import { sendEmail } from "./email";
import type { SendContext, SendResult } from "./format";
import { sendSlack } from "./slack";
import { sendTeams } from "./teams";
import { sendTelegram } from "./telegram";
import { sendWebhook } from "./webhook";

export type { SendResult } from "./format";

const TIMEOUT_MS = 8_000;

/** Dashboard link for a website (also the `url` field of its alerts). */
export function siteDashboardPath(siteId: number): string {
  return `/dashboard/sites/${siteId}`;
}

/**
 * Webhooks to private / internal addresses (n8n on the LAN, localhost…) are refused unless
 * the server sets ALLOW_PRIVATE_WEBHOOKS=1. Slack, Discord, Teams and Telegram are public anyway.
 */
function allowPrivateWebhooks(): boolean {
  const v = process.env.ALLOW_PRIVATE_WEBHOOKS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function sendContext(): Promise<SendContext> {
  const settings = await getSettings();
  return { siteName: settings.site_name, allowPrivate: allowPrivateWebhooks(), timeoutMs: TIMEOUT_MS };
}

function withTimeout(work: Promise<SendResult>, ms: number): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<SendResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: `Timed out after ${Math.round(ms / 1000)} s` }), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Send one alert to one channel. Never throws. */
export async function sendAlert(channel: ChannelRecord, payload: AlertPayload, ctx?: SendContext): Promise<SendResult> {
  const context = ctx ?? (await sendContext());
  const work = (async (): Promise<SendResult> => {
    switch (channel.type) {
      case "email":
        return sendEmail(channel.config as ChannelConfigByType["email"], payload, context);
      case "webhook":
        return sendWebhook(channel.config as ChannelConfigByType["webhook"], payload, context);
      case "slack":
        return sendSlack(channel.config as ChannelConfigByType["slack"], payload, context);
      case "discord":
        return sendDiscord(channel.config as ChannelConfigByType["discord"], payload, context);
      case "teams":
        return sendTeams(channel.config as ChannelConfigByType["teams"], payload, context);
      case "telegram":
        return sendTelegram(channel.config as ChannelConfigByType["telegram"], payload, context);
    }
    return { ok: false, error: "Unknown channel type" };
  })().catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : "Sending failed" }));
  return withTimeout(work, context.timeoutMs + 500);
}

/** Build the payload every channel receives (also the JSON body of webhooks). */
export async function buildAlertPayload(
  site: { id: number; name: string; domain: string } | null,
  event: AlertEvent,
  message: string,
  data: Record<string, number | string> = {},
): Promise<AlertPayload> {
  const settings = await getSettings();
  return {
    event,
    site: site ? { id: site.id, name: site.name, domain: site.domain } : null,
    message,
    data,
    url: absoluteUrl(settings, site ? siteDashboardPath(site.id) : "/dashboard"),
    sentAt: new Date().toISOString(),
  };
}

/**
 * Send `payload` to the active channels among `channelIds` that belong to the site's owner
 * (or to `ownerId` when given), in
 * parallel (8 s timeout each), and log every attempt to alert_log. When no channel is
 * left, one failed row is logged so the alert still shows in the site's history. Never throws.
 */
export async function notifyChannels(
  channelIds: number[],
  payload: AlertPayload,
  siteId: number | null,
  ownerId?: number,
): Promise<{ sent: number; failed: number }> {
  try {
    let owner = ownerId;
    if (owner === undefined && siteId) {
      const db = await getDb();
      owner = (await db.selectFrom("sites").select("user_id").where("id", "=", siteId).executeTakeFirst())?.user_id;
    }
    const channels = owner ? await getActiveChannels(channelIds, owner) : [];
    if (!channels.length) {
      await logAlert({ siteId, channelId: null, event: payload.event, ok: false, error: "No active alert channel selected" }).catch(() => undefined);
      return { sent: 0, failed: 0 };
    }
    const ctx = await sendContext();
    const results = await Promise.all(channels.map((channel) => sendAlert(channel, payload, ctx)));
    let sent = 0;
    await Promise.all(
      results.map((result, i) => {
        if (result.ok) sent += 1;
        return logAlert({ siteId, channelId: channels[i].id, event: payload.event, ok: result.ok, error: result.error ?? null }).catch(() => undefined);
      }),
    );
    return { sent, failed: results.length - sent };
  } catch (error) {
    console.error("[pulsezen] alert delivery failed:", error);
    return { sent: 0, failed: 0 };
  }
}

/** The dashboard's "Send test" button: a sample alert to one channel (logged as event "test"). */
export async function sendTestAlert(channel: ChannelRecord): Promise<SendResult> {
  const ctx = await sendContext();
  const payload = await buildAlertPayload(null, "test", `This is a test alert from ${ctx.siteName}. If you can read this, alerts to "${channel.name}" work.`, {
    example: "Real alerts tell you about traffic spikes, drops and missing data.",
  });
  const result = await sendAlert(channel, payload, ctx);
  await logAlert({ siteId: null, channelId: channel.id, event: "test", ok: result.ok, error: result.error ?? null }).catch(() => undefined);
  return result;
}
