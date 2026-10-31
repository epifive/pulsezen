import { SearchX } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export default async function ShareNotFound() {
  const t = await getT();
  return (
    <div className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div>
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
          <SearchX className="size-5" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">{t("share.err.notFound")}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">{t("share.err.notFoundText")}</p>
      </div>
    </div>
  );
}
