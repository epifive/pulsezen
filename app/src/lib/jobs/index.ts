import "server-only";
import { reportsJob } from "./reports";
import { retentionJob } from "./retention";
import { rollupsJob } from "./rollups";
import { trafficAlertsJob } from "./traffic-alerts";
import { usageJob } from "./usage";

/**
 * Background jobs run by the scheduler (src/lib/scheduler.ts) on every tick, in order,
 * while time is left in the tick's budget. A job does a small, idempotent slice of work
 * and returns how many items it handled; anything it can't finish is picked up next tick.
 * Jobs throttle themselves (settings rows "job_next:<name>", see ./shared.ts).
 */
export interface JobContext {
  /** Epoch ms after which a job should stop starting new work. */
  deadline: number;
  /** Who started the tick. */
  source: "cron" | "worker" | "lazy" | "manual";
}

export interface Job {
  /** Short id shown in Admin → System (e.g. "rollups"). */
  name: string;
  run(ctx: JobContext): Promise<number>;
}

/** Registered jobs, in the order they run. */
export const JOBS: Job[] = [rollupsJob, retentionJob, trafficAlertsJob, reportsJob, usageJob];
