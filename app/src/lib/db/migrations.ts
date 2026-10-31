import "server-only";
import { sql, type Kysely } from "kysely";
import type { Migration, MigrationProvider } from "kysely/migration";
import { DEFAULT_PAGES } from "./seed-pages";
import { DEFAULT_POSTS } from "./seed-posts";

/**
 * Versioned schema migrations. They run automatically on first database
 * access after an update, so operators only need to replace files and restart.
 * Never edit a released migration: add a new one instead.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

const ts = () => new Date().toISOString();

const migrations: Record<string, Migration> = {
  "2026_10_16_000001_initial_schema": {
    async up(db: AnyDb) {
      await db.schema
        .createTable("settings")
        .addColumn("key", "varchar(100)", (c) => c.primaryKey())
        .addColumn("value", "text")
        .execute();

      await db.schema
        .createTable("users")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("email", "varchar(190)", (c) => c.notNull().unique())
        .addColumn("password_hash", "varchar(255)", (c) => c.notNull())
        .addColumn("role", "varchar(20)", (c) => c.notNull().defaultTo("user"))
        .addColumn("status", "varchar(20)", (c) => c.notNull().defaultTo("active"))
        .addColumn("plan_id", "integer")
        .addColumn("plan_expires_at", "varchar(32)")
        .addColumn("stripe_customer_id", "varchar(100)")
        .addColumn("stripe_subscription_id", "varchar(100)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("sessions")
        .addColumn("id", "varchar(64)", (c) => c.primaryKey())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("expires_at", "varchar(32)", (c) => c.notNull())
        .addColumn("ip", "varchar(64)")
        .addColumn("user_agent", "varchar(255)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("sessions_user_id_idx").on("sessions").column("user_id").execute();

      await db.schema
        .createTable("password_resets")
        .addColumn("token_hash", "varchar(64)", (c) => c.primaryKey())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("expires_at", "varchar(32)", (c) => c.notNull())
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("plans")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("name", "varchar(100)", (c) => c.notNull())
        .addColumn("description", "varchar(255)")
        .addColumn("price_monthly", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("price_yearly", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("features", "text")
        // 0 means unlimited for the three limits below.
        .addColumn("max_sites", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("max_monthly_pageviews", "integer", (c) => c.notNull().defaultTo(10000))
        .addColumn("retention_days", "integer", (c) => c.notNull().defaultTo(30))
        .addColumn("max_team_members", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("allow_api", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("remove_branding", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("is_free", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("is_active", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("is_featured", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("payments")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("plan_id", "integer", (c) => c.notNull())
        .addColumn("amount", "integer", (c) => c.notNull())
        .addColumn("currency", "varchar(10)", (c) => c.notNull())
        .addColumn("billing_cycle", "varchar(10)", (c) => c.notNull())
        .addColumn("provider", "varchar(20)", (c) => c.notNull())
        .addColumn("provider_ref", "varchar(190)", (c) => c.notNull().unique())
        .addColumn("status", "varchar(20)", (c) => c.notNull())
        .addColumn("note", "text")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("payments_user_id_idx").on("payments").column("user_id").execute();

      await db.schema
        .createTable("pages")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("slug", "varchar(120)", (c) => c.notNull().unique())
        .addColumn("title", "varchar(255)", (c) => c.notNull())
        .addColumn("content", "text", (c) => c.notNull())
        .addColumn("meta_description", "varchar(255)")
        .addColumn("is_published", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("show_in_footer", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("contact_messages")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("email", "varchar(190)", (c) => c.notNull())
        .addColumn("subject", "varchar(255)", (c) => c.notNull())
        .addColumn("message", "text", (c) => c.notNull())
        .addColumn("ip", "varchar(64)")
        .addColumn("is_read", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema
        .createTable("languages")
        .addColumn("code", "varchar(12)", (c) => c.primaryKey())
        .addColumn("name", "varchar(60)", (c) => c.notNull())
        .addColumn("native_name", "varchar(60)", (c) => c.notNull())
        .addColumn("direction", "varchar(3)", (c) => c.notNull().defaultTo("ltr"))
        .addColumn("is_active", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
        .execute();

      await db.schema
        .createTable("translations")
        .addColumn("lang", "varchar(12)", (c) => c.notNull())
        .addColumn("key", "varchar(190)", (c) => c.notNull())
        .addColumn("value", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("translations_pk", ["lang", "key"])
        .execute();

      await db.schema
        .createTable("posts")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("slug", "varchar(160)", (c) => c.notNull().unique())
        .addColumn("title", "varchar(255)", (c) => c.notNull())
        .addColumn("excerpt", "varchar(500)")
        .addColumn("content", "text", (c) => c.notNull())
        .addColumn("cover_image", "varchar(500)")
        .addColumn("meta_description", "varchar(255)")
        .addColumn("status", "varchar(12)", (c) => c.notNull().defaultTo("draft"))
        .addColumn("published_at", "varchar(32)")
        .addColumn("views", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("posts_status_published_idx").on("posts").columns(["status", "published_at"]).execute();

      // ── Analytics ──
      await db.schema
        .createTable("sites")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("domain", "varchar(255)", (c) => c.notNull())
        .addColumn("public_key", "varchar(32)", (c) => c.notNull().unique())
        .addColumn("timezone", "varchar(64)", (c) => c.notNull().defaultTo("UTC"))
        .addColumn("settings", "text", (c) => c.notNull())
        .addColumn("share_token", "varchar(48)", (c) => c.unique())
        .addColumn("share_password_hash", "varchar(255)")
        .addColumn("verified_at", "varchar(32)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("sites_user_idx").on("sites").column("user_id").execute();
      await db.schema.createIndex("sites_domain_idx").on("sites").column("domain").execute();

      await db.schema
        .createTable("events")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("site_id", "integer", (c) => c.notNull())
        .addColumn("ts", "varchar(32)", (c) => c.notNull())
        .addColumn("session_hash", "varchar(32)", (c) => c.notNull())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("pathname", "varchar(500)", (c) => c.notNull().defaultTo("/"))
        .addColumn("hostname", "varchar(255)", (c) => c.notNull().defaultTo(""))
        .addColumn("referrer_host", "varchar(255)", (c) => c.notNull().defaultTo(""))
        .addColumn("referrer_path", "varchar(500)", (c) => c.notNull().defaultTo(""))
        .addColumn("source", "varchar(120)", (c) => c.notNull().defaultTo(""))
        .addColumn("channel", "varchar(16)", (c) => c.notNull().defaultTo("direct"))
        .addColumn("utm_source", "varchar(120)", (c) => c.notNull().defaultTo(""))
        .addColumn("utm_medium", "varchar(120)", (c) => c.notNull().defaultTo(""))
        .addColumn("utm_campaign", "varchar(160)", (c) => c.notNull().defaultTo(""))
        .addColumn("utm_term", "varchar(160)", (c) => c.notNull().defaultTo(""))
        .addColumn("utm_content", "varchar(160)", (c) => c.notNull().defaultTo(""))
        .addColumn("country", "varchar(2)", (c) => c.notNull().defaultTo(""))
        .addColumn("region", "varchar(80)", (c) => c.notNull().defaultTo(""))
        .addColumn("city", "varchar(120)", (c) => c.notNull().defaultTo(""))
        .addColumn("browser", "varchar(40)", (c) => c.notNull().defaultTo(""))
        .addColumn("browser_version", "varchar(20)", (c) => c.notNull().defaultTo(""))
        .addColumn("os", "varchar(40)", (c) => c.notNull().defaultTo(""))
        .addColumn("device", "varchar(10)", (c) => c.notNull().defaultTo("desktop"))
        .addColumn("screen", "varchar(10)", (c) => c.notNull().defaultTo(""))
        .addColumn("lang", "varchar(16)", (c) => c.notNull().defaultTo(""))
        .addColumn("props", "text")
        .addColumn("revenue_cents", "bigint")
        .addColumn("visit_id", "varchar(24)", (c) => c.notNull().defaultTo(""))
        .addColumn("gap_sec", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("is_entry", "integer", (c) => c.notNull().defaultTo(1))
        .execute();
      await db.schema.createIndex("events_site_ts_idx").on("events").columns(["site_id", "ts"]).execute();
      await db.schema.createIndex("events_site_name_ts_idx").on("events").columns(["site_id", "name", "ts"]).execute();
      await db.schema.createIndex("events_site_session_idx").on("events").columns(["site_id", "session_hash", "ts"]).execute();
      await db.schema.createIndex("events_site_visit_idx").on("events").columns(["site_id", "visit_id"]).execute();

      await db.schema
        .createTable("rollup_daily")
        .addColumn("site_id", "integer", (c) => c.notNull())
        .addColumn("day", "varchar(10)", (c) => c.notNull())
        .addColumn("dimension", "varchar(24)", (c) => c.notNull())
        .addColumn("value", "varchar(255)", (c) => c.notNull())
        .addColumn("visitors", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("visits", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("pageviews", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("events", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("bounces", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("duration_sec", "bigint", (c) => c.notNull().defaultTo(0))
        .addColumn("revenue_cents", "bigint", (c) => c.notNull().defaultTo(0))
        .addPrimaryKeyConstraint("rollup_daily_pk", ["site_id", "day", "dimension", "value"])
        .execute();

      await db.schema
        .createTable("goals")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("site_id", "integer", (c) => c.notNull())
        .addColumn("type", "varchar(12)", (c) => c.notNull())
        .addColumn("value", "varchar(255)", (c) => c.notNull())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("goals_site_idx").on("goals").column("site_id").execute();

      await db.schema
        .createTable("salts")
        .addColumn("day", "varchar(10)", (c) => c.primaryKey())
        .addColumn("salt", "varchar(64)", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("reports")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("site_id", "integer", (c) => c.notNull())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("frequency", "varchar(10)", (c) => c.notNull())
        .addColumn("recipients", "varchar(1000)", (c) => c.notNull())
        .addColumn("last_sent_at", "varchar(32)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("reports_site_idx").on("reports").column("site_id").execute();

      await db.schema
        .createTable("traffic_alerts")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("site_id", "integer", (c) => c.notNull())
        .addColumn("type", "varchar(10)", (c) => c.notNull())
        .addColumn("threshold", "integer", (c) => c.notNull())
        .addColumn("channel_ids", "varchar(500)", (c) => c.notNull().defaultTo("[]"))
        .addColumn("is_active", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("last_triggered_at", "varchar(32)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("traffic_alerts_site_idx").on("traffic_alerts").column("site_id").execute();

      await db.schema
        .createTable("api_keys")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("key_hash", "varchar(64)", (c) => c.notNull().unique())
        .addColumn("prefix", "varchar(12)", (c) => c.notNull())
        .addColumn("last_used_at", "varchar(32)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("api_keys_user_idx").on("api_keys").column("user_id").execute();

      await db.schema
        .createTable("usage_monthly")
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("month", "varchar(7)", (c) => c.notNull())
        .addColumn("pageviews", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("events", "integer", (c) => c.notNull().defaultTo(0))
        .addPrimaryKeyConstraint("usage_monthly_pk", ["user_id", "month"])
        .execute();

      await db.schema
        .createTable("alert_channels")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("user_id", "integer", (c) => c.notNull())
        .addColumn("type", "varchar(12)", (c) => c.notNull())
        .addColumn("name", "varchar(120)", (c) => c.notNull())
        .addColumn("config", "text", (c) => c.notNull())
        .addColumn("is_active", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .addColumn("updated_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("alert_channels_user_idx").on("alert_channels").column("user_id").execute();

      await db.schema
        .createTable("alert_log")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("site_id", "integer")
        .addColumn("channel_id", "integer")
        .addColumn("event", "varchar(30)", (c) => c.notNull())
        .addColumn("ok", "integer", (c) => c.notNull())
        .addColumn("error", "varchar(500)")
        .addColumn("created_at", "varchar(32)", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("alert_log_site_idx").on("alert_log").columns(["site_id", "created_at"]).execute();
    },
    async down(db: AnyDb) {
      for (const table of [
        "alert_log",
        "alert_channels",
        "usage_monthly",
        "api_keys",
        "traffic_alerts",
        "reports",
        "salts",
        "goals",
        "rollup_daily",
        "events",
        "sites",
        "posts",
        "translations",
        "languages",
        "contact_messages",
        "pages",
        "payments",
        "plans",
        "password_resets",
        "sessions",
        "users",
        "settings",
      ]) {
        await db.schema.dropTable(table).ifExists().execute();
      }
    },
  },

  "2026_10_16_000002_seed_defaults": {
    async up(db: AnyDb) {
      const now = ts();
      await db
        .insertInto("plans")
        .values([
          {
            name: "Free",
            description: "Analytics for your personal site or side project.",
            price_monthly: 0,
            price_yearly: 0,
            // Display text only (see Admin → Plans): every plan gets goals, events, email reports, traffic alerts and shared dashboards.
            features: ["1 website", "10,000 pageviews per month", "30 days of detailed data", "Goals, custom events and revenue", "Email reports and traffic alerts", "Public shared dashboard"].join("\n"),
            max_sites: 1,
            max_monthly_pageviews: 10000,
            retention_days: 30,
            max_team_members: 1,
            allow_api: 0,
            remove_branding: 0,
            is_free: 1,
            is_active: 1,
            is_featured: 0,
            sort_order: 1,
            created_at: now,
          },
          {
            name: "Pro",
            description: "For growing businesses with several websites.",
            price_monthly: 900,
            price_yearly: 9000,
            features: ["10 websites", "200,000 pageviews per month", "1 year of detailed data", "Stats API", "Shared dashboards and reports without branding", "Everything in Free"].join("\n"),
            max_sites: 10,
            max_monthly_pageviews: 200000,
            retention_days: 365,
            max_team_members: 5,
            allow_api: 1,
            remove_branding: 1,
            is_free: 0,
            is_active: 1,
            is_featured: 1,
            sort_order: 2,
            created_at: now,
          },
          {
            name: "Agency",
            description: "For agencies reporting on many client websites.",
            price_monthly: 2900,
            price_yearly: 29000,
            features: ["50 websites", "2,000,000 pageviews per month", "2 years of detailed data", "Stats API", "Client-ready shared dashboards without branding", "Everything in Pro"].join("\n"),
            max_sites: 50,
            max_monthly_pageviews: 2000000,
            retention_days: 730,
            max_team_members: 20,
            allow_api: 1,
            remove_branding: 1,
            is_free: 0,
            is_active: 1,
            is_featured: 0,
            sort_order: 3,
            created_at: now,
          },
        ])
        .execute();

      await db
        .insertInto("pages")
        .values(
          DEFAULT_PAGES.map((p) => ({
            slug: p.slug,
            title: p.title,
            content: p.content,
            meta_description: p.metaDescription,
            is_published: 1,
            show_in_footer: 1,
            created_at: now,
            updated_at: now,
          })),
        )
        .execute();

      await db.insertInto("languages").values({ code: "en", name: "English", native_name: "English", direction: "ltr", is_active: 1, sort_order: 0 }).execute();
      await db
        .insertInto("posts")
        .values(
          DEFAULT_POSTS.map((p, i) => ({
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            content: p.content,
            cover_image: null,
            meta_description: p.metaDescription,
            status: "published",
            published_at: new Date(Date.now() - (DEFAULT_POSTS.length - i) * 86_400_000).toISOString(),
            views: 0,
            created_at: now,
            updated_at: now,
          })),
        )
        .execute();
    },
    async down(db: AnyDb) {
      for (const table of ["posts", "languages", "pages", "plans"]) await sql`DELETE FROM ${sql.table(table)}`.execute(db);
    },
  },
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
