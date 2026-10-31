import "server-only";
import type { Insertable, Kysely } from "kysely";
import { seedDemoSites } from "./demo-sites";
import type { Database, PaymentsTable } from "./schema";

/**
 * Sample users, payments and messages so a public demo's admin
 * panel looks like a real, busy site. Runs only once per database and uses
 * multi-row inserts so it stays fast on remote (cloud) databases.
 */

const DAY = 86_400_000;
const FIRST = ["Emma", "Liam", "Olivia", "Noah", "Ava", "Arjun", "Priya", "Lucas", "Mia", "Ethan", "Sofia", "Yuki", "Mateo", "Aisha", "Daniel", "Chloe", "Rahul", "Fatima", "Leo", "Hannah", "Omar", "Grace", "Kenji", "Isabella", "Samuel", "Zara", "Diego", "Nora", "Ravi", "Elena"];
const LAST = ["Johnson", "Patel", "Garcia", "Kim", "Rossi", "Silva", "Khan", "Nguyen", "Smith", "Tanaka", "Haddad", "Brown", "Sharma", "Lopez", "Novak", "Okafor", "Dubois"];
const DOMAINS = ["example.com", "example.net", "studio.io", "agency.co", "mail.com", "proton.me"];
type PaymentRow = Insertable<PaymentsTable>;

export async function seedDemoData(db: Kysely<Database>): Promise<void> {
  // The sample websites belong to the administrator, so wait until one exists (ADMIN_EMAIL/ADMIN_PASSWORD).
  const hasAdmin = await db.selectFrom("users").select("id").where("role", "=", "admin").executeTakeFirst();
  if (!hasAdmin) return;
  // The settings row doubles as a lock: only the instance that inserts it seeds.
  try {
    await db.insertInto("settings").values({ key: "demo_seeded_at", value: new Date().toISOString() }).execute();
  } catch {
    return;
  }

  const started = Date.now();
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  await db.transaction().execute(async (trx) => {
    const paid = await trx.selectFrom("plans").select(["id", "price_monthly", "price_yearly"]).where("is_free", "=", 0).orderBy("sort_order").execute();
    if (paid.length < 2) return;
    const [pro, agency] = paid;
    const businessId = agency.id;

    // Settings that make every admin screen meaningful.
    for (const [key, value] of Object.entries({ offline_enabled: "1", currency: "USD" })) {
      const exists = await trx.selectFrom("settings").select("key").where("key", "=", key).executeTakeFirst();
      if (exists) await trx.updateTable("settings").set({ value }).where("key", "=", key).execute();
      else await trx.insertInto("settings").values({ key, value }).execute();
    }

    const userRows = Array.from({ length: 45 }, (_, i) => {
      const created = iso(Math.floor(rand() * 60) * DAY + Math.floor(rand() * DAY));
      const plan = i % 3 === 0 ? (i % 9 === 0 ? businessId : pro.id) : null;
      const first = FIRST[i % FIRST.length];
      const last = pick(LAST);
      return {
        name: `${first} ${last}`,
        email: `${first}.${last}${i}@${pick(DOMAINS)}`.toLowerCase(),
        // Not a valid hash: sample users can never sign in.
        password_hash: "disabled",
        role: "user" as const,
        status: i === 7 ? ("banned" as const) : ("active" as const),
        plan_id: plan,
        plan_expires_at: plan ? iso(-(10 + Math.floor(rand() * 300)) * DAY) : null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        created_at: created,
        updated_at: created,
      };
    });
    // Insert oldest first so lists sorted by id also read in date order.
    userRows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    await trx.insertInto("users").values(userRows).execute();
    const inserted = await trx
      .selectFrom("users")
      .select(["id", "email"])
      .where("email", "in", userRows.map((u) => u.email))
      .execute();
    const idByEmail = new Map(inserted.map((u) => [u.email, u.id]));
    const users = userRows.map((u) => ({ id: idByEmail.get(u.email)!, plan: u.plan_id }));

    let ref = 1000;
    const payments: PaymentRow[] = [];
    for (const u of users) {
      if (!u.plan) continue;
      for (let n = 0; n < 2; n++) {
        const yearly = rand() < 0.3;
        payments.push({
          user_id: u.id,
          plan_id: u.plan,
          amount: u.plan === businessId ? (yearly ? agency.price_yearly : agency.price_monthly) : yearly ? pro.price_yearly : pro.price_monthly,
          currency: "USD",
          billing_cycle: yearly ? "yearly" : "monthly",
          provider: pick(["stripe", "stripe", "paypal", "razorpay"] as const),
          provider_ref: `demo:${ref++}`,
          status: "paid",
          note: null,
          created_at: iso(Math.floor(rand() * 40) * DAY + 3_600_000),
        });
      }
    }
    const pendingTransfers = [
      { user: users[4].id, plan: pro.id, amount: pro.price_monthly, note: "UTR 4821 9930 1127", hoursAgo: 3 },
      { user: users[10].id, plan: businessId, amount: agency.price_monthly, note: "TRX-20261015-883", hoursAgo: 9 },
    ];
    for (const t of pendingTransfers) {
      payments.push({
        user_id: t.user,
        plan_id: t.plan,
        amount: t.amount,
        currency: "USD",
        billing_cycle: "monthly",
        provider: "offline",
        provider_ref: `demo:${ref++}`,
        status: "pending",
        note: t.note,
        created_at: iso(t.hoursAgo * 3_600_000),
      });
    }
    payments.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    await trx.insertInto("payments").values(payments).execute();

    // Sample websites with 90 days of statistics, goals, reports and alerts.
    const admin = await trx.selectFrom("users").select("id").where("role", "=", "admin").orderBy("id").executeTakeFirst();
    if (admin) {
      const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
      const siteUrl = (await trx.selectFrom("settings").select("value").where("key", "=", "site_url").executeTakeFirst())?.value || process.env.SITE_URL || vercel;
      const result = await seedDemoSites(trx, { adminId: admin.id, siteUrl, rand });
      console.log(`[pulsezen] demo data: ${result.sites} websites, ${result.events} events, ${result.rollups} daily summary rows`);
    }

    await trx
      .insertInto("contact_messages")
      .values([
        { name: "Priya Sharma", email: "priya@studio.io", subject: "Shopify integration", message: "The recent-sales popup works great on my store. Can I show the product image from Shopify orders too?", ip: null, is_read: 0, created_at: iso(2 * 3_600_000) },
        { name: "Daniel Brown", email: "daniel@agency.co", subject: "Agency plan question", message: "We manage 30 client websites. Can each client get their own login to see their widgets?", ip: null, is_read: 0, created_at: iso(20 * 3_600_000) },
        { name: "Kenji Tanaka", email: "kenji@mail.com", subject: "Thank you", message: "Our signups went up after adding the live visitor counter. Thanks!", ip: null, is_read: 1, created_at: iso(3 * DAY) },
      ])
      .execute();
  });
  console.log(`[pulsezen] demo data seeded in ${Date.now() - started} ms`);
}
