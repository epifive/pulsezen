import "server-only";

/** Shared helpers for the dashboard Server Actions (not an action module itself). */

export const idOf = (v: FormDataEntryValue | null) => Number(typeof v === "string" && v.trim() ? v : NaN);
export const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
export const ids = (values: FormDataEntryValue[]) => [...new Set(values.map((v) => idOf(v)).filter((n) => Number.isInteger(n) && n > 0))];

export function parseJsonField(v: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(str(v) || "{}");
  } catch {
    return {};
  }
}
