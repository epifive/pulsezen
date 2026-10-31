// Captures marketing screenshots of a running Pulsezen instance with headless Chrome (CDP).
//
//   node shoot.mjs [baseUrl] [outDir] [only]
//
// baseUrl  default http://localhost:3800 (a production build seeded with DEMO_SEED=true)
// outDir   default ./raw
// only     optional comma list of name prefixes, e.g. "l,d03" (l = landing, d = dashboard,
//          s = shared dashboard, m = mobile, r = Arabic / Hindi, a = admin)
//
// Sign-in: SHOT_EMAIL / SHOT_PASSWORD (default owner@example.com / owner12345).
// The Chrome profile is created in the system temp folder (SHOT_TMP) and removed afterwards.
//
// Recipe used for the screenshots in final/:
//   node demo-extras.mjs apply        sample channels, alert history, API keys, a password link …
//   node shoot.mjs                    (runs "demo-extras.mjs live" itself for the realtime badges)
//   node demo-extras.mjs restore
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./lib/cdp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || "http://localhost:3800").replace(/\/$/, "");
const OUT = path.resolve(process.argv[3] || path.join(HERE, "raw"));
const ONLY = (process.argv[4] ?? "").split(",").filter(Boolean);
const EMAIL = process.env.SHOT_EMAIL ?? "owner@example.com";
const PASSWORD = process.env.SHOT_PASSWORD ?? "owner12345";
// What the screenshots show instead of the local demo addresses (display only, nothing is saved).
const PUBLIC_URL = "https://analytics.example.com";
const HOST = new URL(BASE).host;
const SWAPS = [
  // Optional: show a typical server path instead of your local storage folder (PZ_STORAGE).
  ...(process.env.PZ_STORAGE ? [[new RegExp(process.env.PZ_STORAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "/var/www/pulsezen/storage"]] : []),
  [/testsecret-long-1/g, "k3J9xQ2mV7pL5wR8"],
  [/owner@example\.com/g, "alex@example.com"],
  [new RegExp("https?://" + HOST.replace(/[.:]/g, "\\$&"), "g"), PUBLIC_URL],
  [new RegExp(HOST.replace(/[.:]/g, "\\$&"), "g"), new URL(PUBLIC_URL).host],
];

fs.mkdirSync(OUT, { recursive: true });
const { send, waitFor, evaluate, close, errors } = await launch();

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");

let current = { width: 1440, height: 900, mobile: false, scale: 1 };
async function viewport(width, height, { mobile = false, scale = 1 } = {}) {
  current = { width, height, mobile, scale };
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
}
async function scheme(dark) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }, { name: "prefers-reduced-motion", value: "no-preference" }] });
}
async function lang(code) {
  await send("Network.setCookie", { name: "tz_lang", value: code, url: BASE + "/" });
}
async function theme(t) {
  await evaluate(`localStorage.setItem('tz-theme', '${t}'); true`);
  await scheme(t === "dark");
}
async function go(url, settle = 1800) {
  const loaded = waitFor("Page.loadEventFired");
  await send("Page.navigate", { url: url.startsWith("http") || url.startsWith("file:") ? url : BASE + url });
  await loaded;
  await evaluate("document.fonts.ready.then(() => true)");
  await sleep(settle);
  await prep();
}

// Realtime badges count visits of the last 5 minutes: add a few fresh ones (demo-extras.mjs live).
let lastLive = 0;
function live() {
  if (Date.now() - lastLive < 4 * 60_000) return;
  execFileSync(process.execPath, ["--no-warnings", path.join(HERE, "demo-extras.mjs"), "live"], { stdio: "inherit" });
  lastLive = Date.now();
}

// Hide scrollbars and the cookie banner, finish entrance animations and swap the local demo
// addresses for public-looking ones (text only, nothing is saved).
async function prep() {
  await evaluate(`(() => {
    if (!document.getElementById('pz-shot')) {
      const s = document.createElement('style'); s.id = 'pz-shot';
      s.textContent = 'html{scrollbar-width:none} ::-webkit-scrollbar{display:none} nextjs-portal{display:none!important}';
      document.head.appendChild(s);
    }
    return true; })()`);
  await settleAnimations();
  await brandify();
}
async function settleAnimations() {
  // Finite animations jump to their end; looping ones (float, ping) are paused at a good frame.
  await evaluate(`(() => { document.getAnimations().forEach((a) => { const t = a.effect?.getTiming?.(); if (!t) return;
    if (t.iterations !== Infinity) { try { a.finish(); } catch {} return; }
    a.pause(); a.currentTime = /ping/.test(a.animationName || '') ? 250 : 0; }); return true; })()`);
}
async function brandify() {
  const swaps = SWAPS.map(([re, to]) => [re.source, re.flags, to]);
  await evaluate(`(() => {
    const swaps = ${JSON.stringify(swaps)}.map(([s, f, t]) => [new RegExp(s, f), t]);
    const swap = (v) => swaps.reduce((acc, [re, t]) => acc.replace(re, t), v);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode()); ) { const v = swap(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    document.querySelectorAll('input, textarea').forEach((el) => { if (el.value) { const v = swap(el.value); if (v !== el.value) el.value = v; } if (el.placeholder) el.placeholder = swap(el.placeholder); });
    return true; })()`);
}

async function shot(name, { full = false, clip, height } = {}) {
  await sleep(150);
  const params = { format: "png" };
  if (full || height) {
    const h = height ?? (await evaluate("Math.ceil(document.documentElement.scrollHeight)"));
    params.clip = { x: 0, y: 0, width: current.width, height: h, scale: 1 };
    params.captureBeyondViewport = true;
  } else if (clip) {
    params.clip = { ...clip, scale: 1 };
  }
  const { data } = await send("Page.captureScreenshot", params);
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("saved", name);
}
// Tall screenshot: grow the viewport to the page height first, so sticky sidebars fill it.
async function tall(name, maxHeight = 6000, minHeight = 900) {
  const h = Math.max(minHeight, Math.min(maxHeight, await evaluate("Math.ceil(document.documentElement.scrollHeight)")));
  const keep = { ...current };
  await viewport(current.width, h, { mobile: current.mobile, scale: current.scale });
  await sleep(900);
  await settleAnimations();
  await brandify();
  await shot(name);
  await viewport(keep.width, keep.height, keep);
  return h;
}
// Tall screenshot that ends `pad` px below the element matched by the JS expression `bottomOf`.
async function tallTo(name, bottomOf, pad = 24) {
  const h = await evaluate("Math.ceil(document.documentElement.scrollHeight)");
  const keep = { ...current };
  await viewport(current.width, h, { mobile: current.mobile, scale: current.scale });
  await sleep(900);
  await settleAnimations();
  await brandify();
  const bottom = await evaluate(`(() => { const el = ${bottomOf}; return el ? Math.ceil(el.getBoundingClientRect().bottom + scrollY) : 0; })()`);
  // Shrink the viewport to the picture so fixed/sticky parts (sidebar footer) sit at its bottom.
  const target = bottom ? Math.min(h, bottom + pad) : h;
  await viewport(current.width, target, { mobile: current.mobile, scale: current.scale });
  await sleep(700);
  await settleAnimations();
  await brandify();
  await shot(name);
  await viewport(keep.width, keep.height, keep);
}
// Scroll so the element matched by `selectorExpr` starts `offset` px below the top of the viewport.
async function scrollToEl(selectorExpr, offset = 24) {
  await evaluate(`(() => { const el = ${selectorExpr}; if (!el) return false; scrollTo(0, el.getBoundingClientRect().top + scrollY - ${offset}); return true; })()`);
  await sleep(500);
}
// The home page hero down to the end of the "< 2 KB · 0 cookies · 6 channels · Live" strip.
async function heroShot(name) {
  const strip = await evaluate(`(() => { let el = [...document.querySelectorAll('section')].find((x) => x.getBoundingClientRect().top > 300); return el ? Math.ceil(el.getBoundingClientRect().bottom) : 0; })()`);
  await viewport(1440, strip > 700 && strip < 1100 ? strip : 900);
  await sleep(600);
  await settleAnimations();
  await shot(name);
  await viewport(1440, 900);
}
const want = (name) => !ONLY.length || ONLY.some((p) => name.startsWith(p) || p.startsWith(name));

async function login() {
  await go("/login", 1000);
  await evaluate(`(() => { const set = (n, v) => { const el = document.querySelector('input[name=' + n + ']'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('email', ${JSON.stringify(EMAIL)}); set('password', ${JSON.stringify(PASSWORD)}); document.querySelector('form button[type=submit]').click(); return true; })()`);
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const p = await evaluate("location.pathname");
    if (p !== "/login") return p;
  }
  throw new Error("login failed");
}
const setValue = (selector, value) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const clickText = (selector, re) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => ${re}.test(x.textContent.trim())); el?.click(); return !!el; })()`);
// The card (rounded box) around the heading whose text matches `re`.
const card = (re) => `(() => { const h = [...document.querySelectorAll('h2,h3,div,span')].find((x) => x.children.length === 0 && ${re}.test(x.textContent.trim())); let c = h; while (c && c.parentElement && !/rounded/.test(c.className || '')) c = c.parentElement; return c; })()`;
const SHARE = process.env.SHOT_SHARE_TOKEN ?? "tVqoqDRyV5fN2wkw7j8djPnj";
const ACME_SHARE = (() => { try { return JSON.parse(fs.readFileSync(path.join(HERE, "out", "demo-extras-state.json"), "utf8")).acmeToken; } catch { return null; } })();

try {
  await viewport(1440, 900);
  await scheme(false);
  await go("/", 300);
  await evaluate("localStorage.setItem('pz-cookie-consent','1'); localStorage.setItem('tz-theme','light'); true");
  await lang("en");

  // ── Landing ──
  if (want("l1")) {
    await go("/", 2500);
    await heroShot("l1-home-hero");
  }
  if (want("l2")) {
    await go("/", 1500);
    await evaluate(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); } scrollTo(0, 0); return true; })()`);
    await sleep(1500);
    await tall("l2-home-full", 14000);
  }
  if (want("l3")) {
    await theme("dark");
    await go("/", 2500);
    await heroShot("l3-home-dark");
    await theme("light");
  }
  // Hindi and Arabic home pages (signed out). Devanagari needs more line height than the
  // headline's tight leading: the stacked lines overlap (app bug, reported); loosen it for the picture.
  for (const [name, code] of [["l5-home-hi", "hi"], ["l6-home-ar", "ar"]]) {
    if (!want(name)) continue;
    await lang(code);
    await go("/", 2500);
    if (code === "hi") await evaluate(`(() => { const s = document.createElement('style'); s.textContent = 'h1 { line-height: 1.22 !important; }'; document.head.appendChild(s); return true; })()`);
    await heroShot(name);
    await lang("en");
  }
  if (want("l4")) {
    await go("/pricing", 1500);
    await tallTo("l4-pricing", card("/^Agency$/"), 64);
  }

  // The home page on a phone, signed out (the mobile composition uses it).
  if (want("m2")) {
    await viewport(390, 844, { mobile: true, scale: 2 });
    await go("/", 2500);
    await shot("m2-home");
    await viewport(1440, 900);
  }

  const needLogin = ["d", "m", "r", "a"].some((p) => ONLY.length === 0 || ONLY.some((o) => o.startsWith(p)));
  if (needLogin) {
    console.log("login ->", await login());
    // The app keeps settings in memory: reload them after demo-extras.mjs changed the database.
    await go("/admin/system", 1200);
    console.log("clear caches", await clickText("button", /^Clear caches$/));
    await sleep(1500);
  }

  // ── Customer dashboard ──
  if (want("d")) {
    live();
    const S = "/dashboard/sites/1";
    if (want("d01")) {
      await go(S, 2500);
      await shot("d01-dashboard");
      await tall("d01b-dashboard-full");
    }
    if (want("d02")) {
      await go(S + "?period=12m", 2500);
      await shot("d02-12-months");
    }
    if (want("d03")) {
      // The last 14 days still have raw events, so no "daily summaries only" notice.
      await go(S + "?period=custom&from=2026-10-04&to=2026-10-17&f=country:is:US", 2500);
      await shot("d03-filter-us");
    }
    if (want("d04")) {
      await go(S + "?compare=1", 2500);
      await shot("d04-compare");
    }
    if (want("d05")) {
      await go(S, 2500);
      await clickText("button,[role=tab]", /^AI assistants$/);
      await sleep(1500);
      await scrollToEl(card("/^Sources$/"), 24);
      await brandify();
      await shot("d05-ai-assistants");
    }
    if (want("d06")) {
      await go(S, 2500);
      await clickText("button,[role=tab]", /^Custom events$/);
      await sleep(1500);
      await clickText("button", /^Purchase/);
      await sleep(1800);
      await scrollToEl(card("/^Goals and events$/"), 24);
      await brandify();
      await shot("d06-event-properties");
      await clickText("button,[role=tab]", /^All events$/);
      await sleep(800);
      await clickText("button", /^Outbound Link/);
      await sleep(1800);
      await brandify();
      await shot("d06b-outbound-links");
    }
    if (want("d07")) {
      await go(S + "/details?tab=page&search=products", 2000);
      await shot("d07-details-search");
      await go(S + "/details?tab=source", 2000);
      await shot("d07b-details-sources");
    }
    const pages = [
      ["d08-goals", S + "/goals"],
      ["d09-reports", S + "/reports"],
      ["d11-channels", "/dashboard/channels"],
      ["d12-channel-types", "/dashboard/channels/new"],
      ["d15-api-keys", "/dashboard/api-keys"],
      ["d16-overview", "/dashboard"],
    ];
    for (const [name, url] of pages) {
      if (!want(name)) continue;
      if (name === "d16-overview") live();
      await go(url, 2000);
      await shot(name);
    }
    if (want("d10")) {
      await go(S + "/alerts", 2000);
      await tall("d10-traffic-alerts");
    }
    if (want("d13")) {
      await go(S + "/settings", 2000);
      await shot("d13-site-settings");
      await scrollToEl(card("/^Public dashboard$/"), 24);
      await brandify();
      await shot("d13b-share-embed");
    }
    if (want("d14")) {
      await go(S + "/install", 2000);
      await clickText("button,[role=tab]", /^WordPress$/);
      await sleep(600);
      await brandify();
      await shot("d14-install");
    }
  }

  // ── Shared dashboard ──
  if (want("s")) {
    live();
    await go("/share/" + SHARE, 2500);
    await shot("s1-share");
    await tall("s1b-share-full");
    if (ACME_SHARE) {
      await go("/share/" + ACME_SHARE, 1500);
      await shot("s2-share-password");
    }
  }

  // ── Mobile ──
  if (want("m")) {
    live();
    await viewport(390, 844, { mobile: true, scale: 2 });
    await go("/dashboard/sites/1", 2500);
    await shot("m1-dashboard");
    await go("/share/" + SHARE, 2500);
    await shot("m3-share");
    await go("/dashboard", 2000);
    await shot("m4-overview");
    await viewport(1440, 900);
  }

  // ── Arabic RTL and Hindi ──
  if (want("r")) {
    live();
    await lang("ar");
    await go("/dashboard/sites/1", 2500);
    await shot("r1-dashboard-ar");
    await lang("hi");
    await go("/dashboard/sites/1", 2500);
    await shot("r2-dashboard-hi");
    await lang("en");
  }

  // ── Admin ──
  if (want("a")) {
    for (const [name, url] of [
      ["a1-admin-dashboard", "/admin"],
      ["a2-admin-websites", "/admin/sites"],
      ["a3-admin-system", "/admin/system"],
      ["a4-admin-plans", "/admin/plans"],
      ["a5-admin-settings-analytics", "/admin/settings/analytics"],
      ["a6-admin-users", "/admin/users"],
      ["a7-admin-payments", "/admin/payments"],
      ["a8-admin-languages", "/admin/languages"],
    ]) {
      if (!want(name)) continue;
      // A fresh cron tick first, so the Scheduler card shows a real result (SHOT_CRON_URL).
      if (name === "a3-admin-system" && process.env.SHOT_CRON_URL) console.log("tick", (await (await fetch(process.env.SHOT_CRON_URL)).text()).slice(0, 160));
      await go(url, 2000);
      if (name === "a5-admin-settings-analytics") await tall(name, 2400);
      else if (name === "a3-admin-system") await tallTo(name, card("/^Data$/"), 20);
      else await shot(name);
    }
  }

  console.log("errors:", errors.length ? [...new Set(errors)].slice(0, 25) : "none");
} finally {
  await close();
}
process.exit(0);
