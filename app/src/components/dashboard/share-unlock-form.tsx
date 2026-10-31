"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { unlockShareAction } from "@/app/actions/dashboard/share";
import { initialFormState } from "@/app/actions/types";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { useT } from "@/lib/i18n/client";

export function ShareUnlockForm({ token, embed, siteName }: { token: string; embed: boolean; siteName: string }) {
  const t = useT();
  const [state, action] = useActionState(unlockShareAction, initialFormState);
  return (
    <form action={action} className="mx-auto w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="text-center">
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
          <Lock className="size-5" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">{t("share.locked")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("share.lockedText", { name: siteName })}
        </p>
      </div>
      <input type="hidden" name="token" value={token} />
      {embed ? <input type="hidden" name="embed" value="1" /> : null}
      <FormMessage state={state} />
      <Field label={t("share.password")} htmlFor="share-password">
        <Input id="share-password" name="password" type="password" required autoComplete="current-password" autoFocus />
      </Field>
      <SubmitButton className="w-full" pendingText={t("share.unlocking")}>
        {t("share.unlock")}
      </SubmitButton>
    </form>
  );
}
