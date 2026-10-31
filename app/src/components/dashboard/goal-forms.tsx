"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createGoalAction, updateGoalAction } from "@/app/actions/dashboard/goals";
import { initialFormState, type FormState } from "@/app/actions/types";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { useT } from "@/lib/i18n/client";

export interface GoalFormValues {
  id?: number;
  type: "pageview" | "event";
  value: string;
  name: string;
}

/** Create or edit a goal: a pageview path pattern or a custom event name. */
export function GoalForm({ siteId, goal, onDone }: { siteId: number; goal?: GoalFormValues; onDone?: () => void }) {
  const t = useT();
  const router = useRouter();
  const [type, setType] = useState<"pageview" | "event">(goal?.type ?? "event");
  const [formKey, setFormKey] = useState(0);
  const [state, action] = useActionState(async (prev: FormState, fd: FormData) => {
    const result = await (goal ? updateGoalAction : createGoalAction)(prev, fd);
    if (result.success) {
      router.refresh();
      if (!goal) setFormKey((k) => k + 1);
      onDone?.();
    }
    return result;
  }, initialFormState);
  const idp = goal ? `goal-${goal.id}` : "goal-new";

  return (
    <form key={formKey} action={action} className="space-y-4">
      <input type="hidden" name="site_id" value={siteId} />
      {goal ? <input type="hidden" name="goal_id" value={goal.id} /> : null}
      <input type="hidden" name="type" value={type} />
      <FormMessage state={state} />
      <Segmented
        label={t("dash.goals.type")}
        value={type}
        onChange={setType}
        options={[
          { value: "event", label: t("dash.goals.typeEvent") },
          { value: "pageview", label: t("dash.goals.typePageview") },
        ]}
      />
      {type === "event" ? (
        <Field label={t("dash.goals.eventName")} htmlFor={`${idp}-event`} hint={t("dash.goals.eventHint")}>
          <Input id={`${idp}-event`} name="event" required maxLength={120} dir="auto" placeholder="Signup" defaultValue={goal?.type === "event" ? goal.value : ""} />
        </Field>
      ) : (
        <Field label={t("dash.goals.path")} htmlFor={`${idp}-path`} hint={t("dash.goals.pathHint")}>
          <Input id={`${idp}-path`} name="path" required maxLength={200} dir="ltr" placeholder="/thank-you" defaultValue={goal?.type === "pageview" ? goal.value : ""} />
        </Field>
      )}
      <Field label={t("dash.goals.name")} htmlFor={`${idp}-name`} hint={t("dash.goals.nameHint")}>
        <Input id={`${idp}-name`} name="name" maxLength={120} dir="auto" defaultValue={goal?.name ?? ""} />
      </Field>
      <SubmitButton pendingText={t("dash.settings.saving")}>{goal ? t("dash.goals.save") : t("dash.goals.add")}</SubmitButton>
    </form>
  );
}

/** "Edit" disclosure for one goal row. */
export function GoalEdit({ siteId, goal }: { siteId: number; goal: GoalFormValues }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-sm font-medium text-muted hover:text-primary">
        {open ? t("dash.goals.cancel") : t("dash.goals.edit")}
      </button>
      {open ? (
        <div className="mt-3 w-[min(24rem,80vw)] rounded-lg border border-line bg-paper p-4">
          <GoalForm siteId={siteId} goal={goal} onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
