"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Globe, Lock, RefreshCw, Trash2 } from "lucide-react";
import { initialFormState, type FormState } from "@/app/actions/types";
import { createSiteAction, deleteSiteAction, resetSiteDataAction, saveSiteAction, saveTrackingAction } from "@/app/actions/dashboard/sites";
import { regenerateShareLinkAction, setSharePasswordAction, toggleSharingAction } from "@/app/actions/dashboard/share";
import { Button } from "@/components/ui/button";
import { Field, Hint, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import type { SiteSettings } from "@/analytics/types";
import { useT } from "@/lib/i18n/client";
import { ActionButton } from "./actions";
import { CopyField } from "./copy";

const noop = () => () => {};

/** The visitor's own time zone after hydration ("UTC" while rendering on the server). */
function useBrowserTimezone(): string {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    },
    () => "UTC",
  );
}

function TimezoneSelect({ timezones, value, onChange, id }: { timezones: string[]; value: string; onChange: (v: string) => void; id: string }) {
  const list = timezones.includes(value) ? timezones : [value, ...timezones];
  return (
    <Select id={id} name="timezone" value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}

/** Refreshes server data after a successful action (no revalidatePath). */
function useRefreshingAction(action: (prev: FormState, fd: FormData) => Promise<FormState>) {
  const router = useRouter();
  return useActionState(async (prev: FormState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.success) router.refresh();
    return result;
  }, initialFormState);
}

export function AddSiteForm({ timezones, atLimit }: { timezones: string[]; atLimit: boolean }) {
  const t = useT();
  const browserTz = useBrowserTimezone();
  const [tz, setTz] = useState<string | null>(null);
  const [state, action] = useActionState(createSiteAction, initialFormState);
  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <Field label={t("dash.sites.domain")} htmlFor="site-domain" hint={t("dash.sites.domainHint")}>
        <div className="flex">
          <span dir="ltr" className="inline-flex h-10 items-center rounded-s-lg border border-e-0 border-line bg-paper px-3 text-sm text-muted">
            https://
          </span>
          <Input id="site-domain" name="domain" required dir="ltr" placeholder="example.com" autoComplete="off" className="rounded-s-none" disabled={atLimit} />
        </div>
      </Field>
      <Field label={t("dash.sites.name")} htmlFor="site-name" hint={t("dash.sites.nameHint")}>
        <Input id="site-name" name="name" maxLength={120} dir="auto" placeholder={t("dash.sites.namePlaceholder")} disabled={atLimit} />
      </Field>
      <Field label={t("dash.sites.timezone")} htmlFor="site-tz" hint={t("dash.sites.timezoneHint")}>
        <TimezoneSelect id="site-tz" timezones={timezones} value={tz ?? browserTz} onChange={setTz} />
      </Field>
      <SubmitButton pendingText={t("dash.sites.adding")}>{t("dash.sites.addSubmit")}</SubmitButton>
    </form>
  );
}

export function SiteGeneralForm({ site, timezones }: { site: { id: number; name: string; domain: string; timezone: string }; timezones: string[] }) {
  const t = useT();
  const [tz, setTz] = useState(site.timezone);
  const [state, action] = useRefreshingAction(saveSiteAction);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="site_id" value={site.id} />
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("dash.sites.name")} htmlFor="set-name">
          <Input id="set-name" name="name" required maxLength={120} dir="auto" defaultValue={site.name} />
        </Field>
        <Field label={t("dash.sites.domain")} htmlFor="set-domain" hint={t("dash.settings.domainHint")}>
          <Input id="set-domain" name="domain" required dir="ltr" defaultValue={site.domain} />
        </Field>
      </div>
      <Field label={t("dash.sites.timezone")} htmlFor="set-tz" hint={t("dash.settings.timezoneHint")}>
        <TimezoneSelect id="set-tz" timezones={timezones} value={tz} onChange={setTz} />
      </Field>
      <SubmitButton pendingText={t("dash.settings.saving")}>{t("dash.settings.save")}</SubmitButton>
    </form>
  );
}

export function TrackingForm({ siteId, settings }: { siteId: number; settings: SiteSettings }) {
  const t = useT();
  const [state, action] = useRefreshingAction(saveTrackingAction);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="site_id" value={siteId} />
      <FormMessage state={state} />
      <Field label={t("dash.settings.extraDomains")} htmlFor="tr-domains" hint={t("dash.settings.extraDomainsHint")}>
        <Textarea id="tr-domains" name="extraDomains" dir="ltr" rows={3} className="min-h-20 font-mono text-[13px]" defaultValue={settings.extraDomains.join("\n")} placeholder="staging.example.com" />
      </Field>
      <Field label={t("dash.settings.excludePaths")} htmlFor="tr-paths" hint={t("dash.settings.excludePathsHint")}>
        <Textarea id="tr-paths" name="excludePaths" dir="ltr" rows={3} className="min-h-20 font-mono text-[13px]" defaultValue={settings.excludePaths.join("\n")} placeholder="/admin/*" />
      </Field>
      <Field label={t("dash.settings.excludeIps")} htmlFor="tr-ips" hint={t("dash.settings.excludeIpsHint")}>
        <Textarea id="tr-ips" name="excludeIps" dir="ltr" rows={3} className="min-h-20 font-mono text-[13px]" defaultValue={settings.excludeIps.join("\n")} placeholder="203.0.113.7" />
      </Field>
      <div className="space-y-4 rounded-lg border border-line p-4">
        <Switch name="allowLocalhost" defaultChecked={settings.allowLocalhost} label={t("dash.settings.localhost")} description={t("dash.settings.localhostHint")} />
        <Switch name="hashRouting" defaultChecked={settings.hashRouting} label={t("dash.settings.hashRouting")} description={t("dash.settings.hashRoutingHint")} />
      </div>
      <SubmitButton pendingText={t("dash.settings.saving")}>{t("dash.settings.save")}</SubmitButton>
    </form>
  );
}

export function SharingPanel({
  siteId,
  shareUrl,
  hasPassword,
  removeBranding,
}: {
  siteId: number;
  /** Full public URL, or null when sharing is off. */
  shareUrl: string | null;
  hasPassword: boolean;
  removeBranding: boolean;
}) {
  const t = useT();
  const [pwState, pwAction] = useRefreshingAction(setSharePasswordAction);
  if (!shareUrl) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xl text-sm text-muted">{t("dash.share.offText")}</p>
        <ActionButton action={toggleSharingAction} fields={{ site_id: siteId, enable: "1" }} variant="primary" size="md">
          <Globe aria-hidden />
          {t("dash.share.enable")}
        </ActionButton>
      </div>
    );
  }
  const embed = `<iframe src="${shareUrl}?embed=1" style="width:100%;height:1600px;border:0" loading="lazy" title="${t("share.iframeTitle")}"></iframe>`;
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1.5 text-sm font-medium">{t("dash.share.link")}</p>
        <CopyField value={shareUrl} label={t("dash.share.link")} />
        <Hint>{t("dash.share.linkHint")}</Hint>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-sm font-medium hover:border-primary-line hover:text-primary">
            {t("dash.share.open")}
          </a>
          <ActionButton action={regenerateShareLinkAction} fields={{ site_id: siteId }} confirmText={t("dash.share.regenerateConfirm")}>
            <RefreshCw aria-hidden />
            {t("dash.share.regenerate")}
          </ActionButton>
          <ActionButton action={toggleSharingAction} fields={{ site_id: siteId, enable: "0" }} variant="ghost" confirmText={t("dash.share.disableConfirm")}>
            {t("dash.share.disable")}
          </ActionButton>
        </div>
      </div>
      <form action={pwAction} className="space-y-3 border-t border-line pt-5">
        <input type="hidden" name="site_id" value={siteId} />
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-muted" aria-hidden />
          <p className="text-sm font-medium">{t("dash.share.password")}</p>
          <span className="text-xs text-muted">{hasPassword ? t("dash.share.passwordOn") : t("dash.share.passwordOff")}</span>
        </div>
        <FormMessage state={pwState} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="password" name="password" minLength={6} maxLength={200} autoComplete="new-password" placeholder={hasPassword ? t("dash.share.passwordNew") : t("dash.share.passwordPlaceholder")} aria-label={t("dash.share.password")} className="sm:max-w-xs" />
          <SubmitButton variant="outline" pendingText={t("dash.settings.saving")}>
            {t("dash.share.passwordSave")}
          </SubmitButton>
          {hasPassword ? (
            <Button type="submit" name="remove" value="1" variant="ghost" formNoValidate>
              {t("dash.share.passwordRemove")}
            </Button>
          ) : null}
        </div>
        <Hint>{t("dash.share.passwordHint")}</Hint>
      </form>
      <div className="border-t border-line pt-5">
        <p className="mb-1.5 text-sm font-medium">{t("dash.share.embed")}</p>
        <CopyField value={embed} label={t("dash.share.embed")} multiline />
        <Hint>{removeBranding ? t("dash.share.embedHint") : t("dash.share.embedHintBranding")}</Hint>
      </div>
    </div>
  );
}

export function DangerZone({ site }: { site: { id: number; domain: string } }) {
  const t = useT();
  const [confirm, setConfirm] = useState("");
  const [state, action] = useActionState(deleteSiteAction, initialFormState);
  return (
    <div className="divide-y divide-line">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
        <div className="max-w-xl">
          <p className="text-sm font-medium">{t("dash.settings.resetTitle")}</p>
          <p className="mt-0.5 text-sm text-muted">{t("dash.settings.resetText")}</p>
        </div>
        <ActionButton action={resetSiteDataAction} fields={{ site_id: site.id }} confirmText={t("dash.settings.resetConfirm", { domain: site.domain })} showSuccess>
          <RefreshCw aria-hidden />
          {t("dash.settings.reset")}
        </ActionButton>
      </div>
      <form action={action} className="space-y-3 pt-5">
        <input type="hidden" name="site_id" value={site.id} />
        <p className="text-sm font-medium">{t("dash.settings.deleteTitle")}</p>
        <p className="text-sm text-muted">{t("dash.settings.deleteText", { domain: site.domain })}</p>
        <FormMessage state={state} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            dir="ltr"
            autoComplete="off"
            placeholder={site.domain}
            aria-label={t("dash.settings.deleteLabel", { domain: site.domain })}
            className="sm:max-w-xs"
          />
          <Button type="submit" variant="danger" disabled={confirm.trim().toLowerCase() !== site.domain}>
            <Trash2 aria-hidden />
            {t("dash.settings.delete")}
          </Button>
        </div>
      </form>
    </div>
  );
}
