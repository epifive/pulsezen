// Optional sample data for the marketing screenshots, written straight into the demo database
// (SQLite, node:sqlite) and removed again afterwards.
//
//   node demo-extras.mjs apply     channels, alert history, a second report, API keys, a drop
//                                  alert, a password-protected share link (Acme Docs), SMTP
//                                  settings, admin renamed "Alex Morgan"
//   node demo-extras.mjs live      a few visits in the last two minutes (realtime badges);
//                                  run it again right before realtime scenes
//   node demo-extras.mjs restore   removes / reverts everything listed above
//
// DB: PZ_DB (default ../app/storage/database.sqlite). What was changed is remembered in
// out/demo-extras-state.json, so restore puts back exactly the previous values.
// After apply/restore click Admin → System → "Clear caches" (shoot.mjs does) because the app
// keeps the settings in memory.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = process.env.PZ_DB ?? path.join(HERE, "..", "app", "storage", "database.sqlite");
const STATE = path.join(HERE, "out", "demo-extras-state.json");
const cmd = process.argv[2];

const db = new DatabaseSync(DB);
db.exec("PRAGMA busy_timeout = 10000");
fs.mkdirSync(path.dirname(STATE), { recursive: true });
const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { ids: {}, settings: {}, rows: {}, events: [] });
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const H = 3600_000, D = 24 * H;

function insert(table, row) {
  const keys = Object.keys(row);
  const r = db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((k) => row[k]));
  return Number(r.lastInsertRowid);
}

function setSetting(state, key, value) {
  if (!(key in state.settings)) state.settings[key] = db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? null;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function remember(state, table, id, cols) {
  const k = `${table}:${id}`;
  if (!(k in state.rows)) state.rows[k] = db.prepare(`SELECT ${cols.join(",")} FROM ${table} WHERE id = ?`).get(id);
}

if (cmd === "apply") {
  const s = load();
  if (Object.keys(s.ids).length) throw new Error("already applied; run restore first");
  const ids = (s.ids = { alert_channels: [], alert_log: [], reports: [], api_keys: [], traffic_alerts: [] });
  const t0 = "2026-07-20T09:00:00.000Z";

  remember(s, "users", 1, ["name"]);
  db.prepare("UPDATE users SET name = 'Alex Morgan' WHERE id = 1").run();

  const ch = (type, name, config, active = 1) => {
    const id = insert("alert_channels", { user_id: 1, type, name, config: JSON.stringify(config), is_active: active, created_at: t0, updated_at: t0 });
    ids.alert_channels.push(id);
    return id;
  };
  const slack = ch("slack", "#marketing", { webhookUrl: "https://hooks.slack.com/services/T00000000/B00000000/EXAMPLEexampleEXAMPLE000" });
  const telegram = ch("telegram", "Founders chat", { botToken: "123456789:AAExample-bot-token-for-screenshots", chatId: "-1002345678901" });
  const discord = ch("discord", "Growth team", { webhookUrl: "https://discord.com/api/webhooks/000000000000/example-token" });
  const teams = ch("teams", "Marketing (Teams)", { webhookUrl: "https://prod-42.westeurope.logic.azure.com/workflows/8c1f0e2a/triggers/manual/paths/invoke" });

  // The spike alert also goes to Slack and Telegram; a new drop alert for Northwind Store.
  remember(s, "traffic_alerts", 1, ["channel_ids"]);
  db.prepare("UPDATE traffic_alerts SET channel_ids = ? WHERE id = 1").run(JSON.stringify([1, slack, telegram]));
  ids.traffic_alerts.push(insert("traffic_alerts", { site_id: 1, type: "drop", threshold: 50, channel_ids: JSON.stringify([1, slack]), is_active: 1, last_triggered_at: null, created_at: t0 }));
  ids.traffic_alerts.push(insert("traffic_alerts", { site_id: 2, type: "spike", threshold: 4, channel_ids: JSON.stringify([discord, teams]), is_active: 1, last_triggered_at: null, created_at: t0 }));

  // Alert history: the campaign spike also went to Slack and Telegram.
  for (const channel of [slack, telegram]) ids.alert_log.push(insert("alert_log", { site_id: 1, channel_id: channel, event: "traffic_spike", ok: 1, error: null, created_at: "2026-09-26T15:17:00.000Z" }));

  ids.reports.push(insert("reports", { site_id: 1, user_id: 1, frequency: "monthly", recipients: "alex@northwind.example, marketing@northwind.example", last_sent_at: "2026-10-01T04:05:00.000Z", created_at: t0 }));

  for (const [name, used, created] of [["Client reports (Looker Studio)", 2 * H, "2026-08-03T11:20:00.000Z"], ["Google Sheets sync", 26 * H, "2026-09-12T08:45:00.000Z"], ["Investor dashboard", null, "2026-10-02T16:10:00.000Z"]]) {
    const key = "pz_" + crypto.randomBytes(24).toString("base64url");
    ids.api_keys.push(insert("api_keys", { user_id: 1, name, key_hash: crypto.createHash("sha256").update(key).digest("hex"), prefix: key.slice(0, 10), last_used_at: used ? iso(used) : null, created_at: created }));
  }

  // A password-protected public link for Acme Docs (password: "acme-clients").
  remember(s, "sites", 2, ["share_token", "share_password_hash"]);
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync("acme-clients", salt, 64, { N: 16384, r: 8, p: 1 });
  s.acmeToken = crypto.randomBytes(36).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  db.prepare("UPDATE sites SET share_token = ?, share_password_hash = ? WHERE id = 2").run(s.acmeToken, ["scrypt", 16384, 8, 1, salt.toString("base64"), hash.toString("base64")].join("$"));

  // A year of history for Northwind Store: the demo has 90 days, so the 12-month chart would be
  // mostly empty. Older days are copied from the summaries of the same weekday, scaled to a
  // growth curve (about 40 % of today's traffic a year ago). Removed again by restore.
  const first = db.prepare("SELECT MIN(day) d FROM rollup_daily WHERE site_id = 1").get().d;
  s.historyBefore = first;
  const srcDays = db.prepare("SELECT DISTINCT day FROM rollup_daily WHERE site_id = 1 AND day < '2026-09-20' ORDER BY day").all().map((r) => r.day);
  const rowsOf = db.prepare("SELECT * FROM rollup_daily WHERE site_id = 1 AND day = ?");
  const put = db.prepare("INSERT INTO rollup_daily (site_id, day, dimension, value, visitors, visits, pageviews, events, bounces, duration_sec, revenue_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  const start = Date.parse("2025-11-01T00:00:00Z"), end = Date.parse(first + "T00:00:00Z");
  let n = 0;
  db.exec("BEGIN");
  for (let t = start, i = 0; t < end; t += D, i++) {
    const day = new Date(t).toISOString().slice(0, 10);
    const progress = (t - start) / (end - start);
    const f = (0.38 + 0.55 * progress) * (0.92 + 0.16 * Math.abs(Math.sin(i * 1.7)));
    const wd = new Date(t).getUTCDay();
    const src = srcDays.filter((d) => new Date(d + "T00:00:00Z").getUTCDay() === wd)[i % 8];
    for (const r of rowsOf.all(src)) {
      const sc = (v) => Math.round(Number(v) * f);
      const visitors = Math.max(r.visitors > 0 ? 1 : 0, sc(r.visitors));
      put.run(1, day, r.dimension, r.value, visitors, Math.max(visitors, sc(r.visits)), sc(r.pageviews), sc(r.events), Math.min(sc(r.bounces), Math.max(visitors, sc(r.visits))), sc(r.duration_sec), sc(r.revenue_cents));
      n++;
    }
  }
  db.exec("COMMIT");
  console.log("history rows", n);

  // SMTP looks configured (no report or usage email is due, and no cron tick is run while it's on).
  setSetting(s, "mail_enabled", "1");
  setSetting(s, "smtp_host", "smtp.mailgun.org");
  setSetting(s, "smtp_user", "postmaster@mg.example.com");
  setSetting(s, "mail_from_address", "reports@example.com");
  save(s);
  console.log("applied", JSON.stringify(ids), "acme share token", s.acmeToken);
} else if (cmd === "live") {
  // Copy a few recent visits of the demo sites with a timestamp in the last two minutes.
  const s = load();
  // Acme Docs (Europe/Berlin) only while its day is far from finished, so no daily summary is
  // built while these extra events exist.
  const berlinOk = new Date().getUTCHours() < 21 || (new Date().getUTCHours() === 21 && new Date().getUTCMinutes() < 30);
  for (const [site, n] of [[1, 7], ...(berlinOk ? [[2, 3]] : []), [3, 2]]) {
    const rows = db.prepare("SELECT * FROM events WHERE site_id = ? AND name = 'pageview' AND is_entry = 1 ORDER BY id DESC LIMIT 60").all(site);
    for (let i = 0; i < n; i++) {
      const r = { ...rows[(i * 7) % rows.length] };
      delete r.id;
      r.ts = iso(5_000 + Math.random() * 110_000);
      r.session_hash = crypto.randomBytes(16).toString("hex");
      r.visit_id = crypto.randomBytes(12).toString("base64url").slice(0, 16);
      s.events.push(insert("events", r));
    }
  }
  save(s);
  console.log("live events", s.events.length);
} else if (cmd === "restore") {
  const s = load();
  for (const [table, list] of Object.entries(s.ids)) for (const id of list) db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  for (const id of s.events) db.prepare("DELETE FROM events WHERE id = ?").run(id);
  if (s.historyBefore) db.prepare("DELETE FROM rollup_daily WHERE site_id = 1 AND day < ?").run(s.historyBefore);
  for (const [k, row] of Object.entries(s.rows)) {
    const [table, id] = k.split(":");
    const cols = Object.keys(row);
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => c + " = ?").join(", ")} WHERE id = ?`).run(...cols.map((c) => row[c]), Number(id));
  }
  for (const [key, value] of Object.entries(s.settings)) {
    if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    else db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(value, key);
  }
  fs.rmSync(STATE);
  console.log("restored", Object.values(s.ids).flat().length, "rows,", s.events.length, "events,", Object.keys(s.settings).length, "settings,", Object.keys(s.rows).length, "updated rows");
} else {
  console.log("usage: node demo-extras.mjs apply|live|restore");
}
