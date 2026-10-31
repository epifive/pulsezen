"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { saveAlertAction } from "@/app/actions/dashboard/alerts";
import { initialFormState } from "@/app/actions/types";
import { ChannelIcon } from "@/components/dashboard/channel-forms";
import { Checkbox, Field, Input, Switch } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { ChannelType, TrafficAlertType } from "@/analytics/types";

const TYPES: TrafficAlertType[] = ["spike", "drop", "silence"];
const DEFAULTS: Record<TrafficAlertType, number> = { spike: 3, drop: 50, silence: 6 };
const RANGES: Record<TrafficAlertType, [number, number]> = { spike: [2, 100], drop: [1, 99], silence: [1, 720] };

export interface AlertFormChannel {
  id: number;
  name: string;
  type: ChannelType;
  isActive: boolean;
}

/** Create a traffic alert for a site, or edit one (threshold, channels, active). */
export function AlertForm({
  siteId,
  alert,
  channels,
}: {
  siteId: number;
  alert?: { id: number; type: TrafficAlertType; threshold: number; channelIds: number[]; isActive: boolean };
  channels: AlertFormChannel[];
}) {
  const t = useT();
  const uid = useId();
  const [state, action] = useActionState(saveAlertAction, initialFormState);
  const [type, setType] = useState<TrafficAlertType>(alert?.type ?? "spike");
  const [threshold, setThreshold] = useState(String(alert?.threshold ?? DEFAULTS[type]));
  const [min, max] = RANGES[type];

  const pick = (next: TrafficAlertType) => {
    setType(next);
    setThreshold(String(DEFAULTS[next]));
  };

  return (
    <form action={action} className="space-y-5">
      {alert ? <input type="hidden" name="alert_id" value={alert.id} /> : <input type="hidden" name="site_id" value={siteId} />}
      <FormMessage state={state} />

      {alert ? null : (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">{t("dash.alerts.type")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map((ty) => (
              <label
                key={ty}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors",
                  type === ty ? "border-primary bg-primary-soft/50" : "border-line hover:border-primary-line",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input type="radio" name="type" value={ty} checked={type === ty} onChange={() => pick(ty)} className="accent-[var(--primary)]" />
                  {t(`dash.alerts.type.${ty}`)}
                </span>
                <span className="text-xs text-muted">{t(`dash.alerts.typeDesc.${ty}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field label={t(`dash.alerts.threshold.${type}`)} htmlFor={`${uid}-threshold`} hint={t(`dash.alerts.explain.${type}`)}>
        <Input
          id={`${uid}-threshold`}
          name="threshold"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          required
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="max-w-32 tabular-nums"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">{t("dash.alerts.channels")}</legend>
        {channels.length ? (
          <>
            <div className="flex flex-col gap-2">
              {channels.map((c) => (
                <Checkbox
                  key={c.id}
                  name="channel_ids"
                  value={c.id}
                  defaultChecked={alert ? alert.channelIds.includes(c.id) : channels.length === 1}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <ChannelIcon type={c.type} className="size-4 text-muted" />
                      <span dir="auto">{c.name}</span>
                      {!c.isActive ? <span className="text-xs text-muted">({t("dash.channels.off")})</span> : null}
                    </span>
                  }
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {t("dash.alerts.channelsHint")}{" "}
              <Link href="/dashboard/channels" className="text-primary hover:underline">
                {t("dash.alerts.manageChannels")}
              </Link>
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            {t("dash.alerts.noChannels")}{" "}
            <Link href="/dashboard/channels/new" className="font-medium text-primary hover:underline">
              {t("dash.alerts.addChannel")}
            </Link>
          </p>
        )}
      </fieldset>

      {alert ? <Switch name="active" label={t("dash.channels.active")} defaultChecked={alert.isActive} /> : null}

      <SubmitButton pendingText={t("dash.alerts.saving")}>{alert ? t("dash.alerts.save") : t("dash.alerts.create")}</SubmitButton>
    </form>
  );
}
