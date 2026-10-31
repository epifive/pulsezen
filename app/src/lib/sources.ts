import type { Channel } from "@/analytics/types";

/**
 * Traffic source normalisation and channel grouping for incoming events.
 * Pure functions (no I/O), safe to import anywhere on the server.
 */

export const DIRECT_SOURCE = "Direct / None";

interface SourceRule {
  name: string;
  channel: Channel;
  /** Matches the referrer hostname (lower case, without "www."). */
  host: RegExp;
  /** Optional referrer path condition (e.g. bing.com/chat is Copilot, not Bing search). */
  path?: RegExp;
  /** utm_source values (lower case) that mean this source. */
  aliases?: string[];
}

const G = (s: string) => new RegExp(`(^|\\.)${s}$`);
/** google.com, google.co.uk, google.de … */
const tld = (name: string) => new RegExp(`(^|\\.)${name}\\.(com?\\.)?[a-z]{2,3}$`);

// Order matters: the first match wins (AI assistants before the search engines they live on).
const RULES: SourceRule[] = [
  // AI assistants
  { name: "ChatGPT", channel: "ai", host: /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, aliases: ["chatgpt", "chatgpt.com", "openai"] },
  { name: "Perplexity", channel: "ai", host: G("perplexity\\.ai"), aliases: ["perplexity", "perplexity.ai"] },
  { name: "Gemini", channel: "ai", host: /^(gemini|bard)\.google\.com$/, aliases: ["gemini", "bard", "gemini.google.com"] },
  { name: "Copilot", channel: "ai", host: /^(copilot\.microsoft\.com|copilot\.cloud\.microsoft|edgeservices\.bing\.com)$/, aliases: ["copilot", "copilot.microsoft.com", "bing chat"] },
  { name: "Copilot", channel: "ai", host: G("bing\\.com"), path: /^\/(chat|copilot)/ },
  { name: "Claude", channel: "ai", host: G("claude\\.ai"), aliases: ["claude", "claude.ai", "anthropic"] },
  { name: "DeepSeek", channel: "ai", host: G("deepseek\\.com"), aliases: ["deepseek", "chat.deepseek.com"] },
  { name: "Poe", channel: "ai", host: G("poe\\.com"), aliases: ["poe", "poe.com"] },
  { name: "You.com", channel: "ai", host: G("you\\.com"), aliases: ["you.com"] },
  { name: "Phind", channel: "ai", host: G("phind\\.com"), aliases: ["phind", "phind.com"] },
  { name: "Meta AI", channel: "ai", host: G("meta\\.ai"), aliases: ["meta.ai", "meta ai"] },
  { name: "Grok", channel: "ai", host: G("grok\\.com"), aliases: ["grok", "grok.com"] },
  { name: "Grok", channel: "ai", host: /^(x|twitter)\.com$/, path: /^\/i\/grok/ },
  { name: "Mistral", channel: "ai", host: /^chat\.mistral\.ai$/, aliases: ["mistral", "lechat"] },
  { name: "Kimi", channel: "ai", host: /(^|\.)(kimi\.ai|kimi\.com|moonshot\.cn)$/, aliases: ["kimi"] },

  // Email (webmail)
  { name: "Gmail", channel: "email", host: /^mail\.google\.com$/, aliases: ["gmail"] },
  { name: "Outlook", channel: "email", host: /^(outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com)$/, aliases: ["outlook"] },
  { name: "Yahoo Mail", channel: "email", host: /(^|\.)mail\.yahoo\.com$/ },
  { name: "Proton Mail", channel: "email", host: /^mail\.proton\.me$/ },

  // Search engines
  { name: "Google", channel: "search", host: tld("google"), aliases: ["google", "google.com"] },
  { name: "Bing", channel: "search", host: G("bing\\.com"), aliases: ["bing", "bing.com"] },
  { name: "DuckDuckGo", channel: "search", host: G("duckduckgo\\.com"), aliases: ["duckduckgo", "ddg"] },
  { name: "Yahoo", channel: "search", host: tld("yahoo"), aliases: ["yahoo"] },
  { name: "Yandex", channel: "search", host: tld("yandex"), aliases: ["yandex"] },
  { name: "Baidu", channel: "search", host: G("baidu\\.com"), aliases: ["baidu"] },
  { name: "Ecosia", channel: "search", host: G("ecosia\\.org"), aliases: ["ecosia"] },
  { name: "Brave Search", channel: "search", host: /^search\.brave\.com$/, aliases: ["brave"] },
  { name: "Startpage", channel: "search", host: G("startpage\\.com") },
  { name: "Qwant", channel: "search", host: G("qwant\\.com") },
  { name: "Kagi", channel: "search", host: G("kagi\\.com") },
  { name: "Naver", channel: "search", host: G("naver\\.com") },
  { name: "Seznam", channel: "search", host: G("seznam\\.cz") },

  // Social networks and communities
  { name: "X (Twitter)", channel: "social", host: /^(t\.co|twitter\.com|x\.com|mobile\.twitter\.com)$/, aliases: ["twitter", "x", "x.com", "t.co"] },
  { name: "Facebook", channel: "social", host: /(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, aliases: ["facebook", "fb", "facebook.com", "meta"] },
  { name: "Instagram", channel: "social", host: G("instagram\\.com"), aliases: ["instagram", "ig"] },
  { name: "LinkedIn", channel: "social", host: /(^|\.)(linkedin\.com|lnkd\.in)$/, aliases: ["linkedin", "lnkd.in"] },
  { name: "Reddit", channel: "social", host: /(^|\.)(reddit\.com|redd\.it)$/, aliases: ["reddit"] },
  { name: "YouTube", channel: "social", host: /(^|\.)(youtube\.com|youtu\.be)$/, aliases: ["youtube", "yt"] },
  { name: "Pinterest", channel: "social", host: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, aliases: ["pinterest"] },
  { name: "TikTok", channel: "social", host: G("tiktok\\.com"), aliases: ["tiktok"] },
  { name: "Threads", channel: "social", host: G("threads\\.(net|com)"), aliases: ["threads"] },
  { name: "Bluesky", channel: "social", host: G("bsky\\.app"), aliases: ["bluesky", "bsky"] },
  { name: "Mastodon", channel: "social", host: /(^|\.)(mastodon\.[a-z.]+|mstdn\.[a-z.]+)$/, aliases: ["mastodon"] },
  { name: "Hacker News", channel: "social", host: /^news\.ycombinator\.com$/, aliases: ["hackernews", "hacker news", "hn", "ycombinator"] },
  { name: "Product Hunt", channel: "social", host: G("producthunt\\.com"), aliases: ["producthunt", "product hunt"] },
  { name: "WhatsApp", channel: "social", host: /(^|\.)(whatsapp\.com|wa\.me)$/, aliases: ["whatsapp"] },
  { name: "Telegram", channel: "social", host: /(^|\.)(t\.me|telegram\.org|telegram\.me)$/, aliases: ["telegram"] },
  { name: "Discord", channel: "social", host: /(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/, aliases: ["discord"] },
  { name: "VK", channel: "social", host: G("vk\\.com"), aliases: ["vk"] },
  { name: "Quora", channel: "social", host: G("quora\\.com"), aliases: ["quora"] },
  { name: "Snapchat", channel: "social", host: G("snapchat\\.com"), aliases: ["snapchat"] },

  // Well-known referrers
  { name: "GitHub", channel: "referral", host: G("github\\.com"), aliases: ["github"] },
  { name: "Medium", channel: "referral", host: G("medium\\.com"), aliases: ["medium"] },
  { name: "Stack Overflow", channel: "referral", host: G("stackoverflow\\.com"), aliases: ["stackoverflow"] },
];

/** Source names of the AI assistants ("ChatGPT", "Perplexity"…). */
export const AI_SOURCES: ReadonlySet<string> = new Set(RULES.filter((r) => r.channel === "ai").map((r) => r.name));

/** Android apps report referrers like android-app://com.google.android.gm. */
const ANDROID_APPS: Record<string, string> = {
  "com.google.android.gm": "mail.google.com",
  "com.google.android.googlequicksearchbox": "google.com",
  "com.google.android.apps.searchlite": "google.com",
  "com.slack": "slack.com",
  "com.linkedin.android": "linkedin.com",
  "com.reddit.frontpage": "reddit.com",
  "com.twitter.android": "x.com",
  "com.facebook.katana": "facebook.com",
  "com.instagram.android": "instagram.com",
  "org.telegram.messenger": "t.me",
  "com.openai.chatgpt": "chatgpt.com",
};

const ALIASES = new Map<string, SourceRule>();
for (const rule of RULES) for (const alias of rule.aliases ?? []) if (!ALIASES.has(alias)) ALIASES.set(alias, rule);

function ruleForHost(host: string, path = "/"): SourceRule | undefined {
  return RULES.find((r) => r.host.test(host) && (!r.path || r.path.test(path)));
}

export interface ParsedReferrer {
  /** Lower-case hostname without "www." ("" when none or a self-referral). */
  host: string;
  path: string;
}

/**
 * Parses document.referrer. Returns an empty referrer for invalid values, non-web
 * schemes and self-referrals (`isOwnHost(host)` true).
 */
export function parseReferrer(raw: string, isOwnHost: (host: string) => boolean): ParsedReferrer {
  const none = { host: "", path: "" };
  if (!raw) return none;
  try {
    const url = new URL(raw);
    if (url.protocol === "android-app:") {
      const host = ANDROID_APPS[url.hostname] ?? url.hostname;
      return { host: host.slice(0, 255), path: "" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return none;
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    if (!host || isOwnHost(host)) return none;
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep encoded
    }
    return { host: host.slice(0, 255), path: path.slice(0, 500) };
  } catch {
    return none;
  }
}

export interface Utm {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
}

const PAID_CLICK_IDS = ["gclid", "gbraid", "wbraid", "msclkid", "dclid", "ttclid", "twclid", "li_fat_id", "gad_source"];
const PAID_MEDIUM = /^(cpc|ppc|cpm|cpv|cpa|cpp|paid|ads?|display|banner|retargeting|remarketing|paid[-_ ]?(search|social|media|ads?))$|paid/;
const EMAIL_MEDIUM = /^(e[-_ ]?mail|newsletter|mail|edm)$/;
const SOCIAL_MEDIUM = /^(social|social[-_ ]?(media|network)|sm|sns)$/;
const SEARCH_MEDIUM = /^(organic|seo|search)$/;

export interface Attribution {
  source: string;
  channel: Channel;
}

/**
 * Traffic source ("Google", "ChatGPT", "newsletter", "example.org", "Direct / None") and channel.
 * utm_source overrides the referrer; click ids (gclid, msclkid …) and paid utm_medium values mean "paid".
 */
export function attribute(referrer: ParsedReferrer, utm: Utm, params: URLSearchParams): Attribution {
  const refRule = referrer.host ? ruleForHost(referrer.host, referrer.path) : undefined;
  let source = DIRECT_SOURCE;
  let rule: SourceRule | undefined;

  if (utm.utm_source) {
    const key = utm.utm_source.replace(/^www\./, "");
    rule = ALIASES.get(key) ?? (key.includes(".") ? ruleForHost(key) : undefined);
    source = rule ? rule.name : utm.utm_source.slice(0, 120);
  } else if (referrer.host) {
    rule = refRule;
    source = rule ? rule.name : referrer.host.slice(0, 120);
  }

  const medium = utm.utm_medium;
  let channel: Channel;
  if (PAID_MEDIUM.test(medium) || PAID_CLICK_IDS.some((id) => params.has(id))) channel = "paid";
  else if (EMAIL_MEDIUM.test(medium) || /newsletter|e-?mail/.test(utm.utm_source)) channel = "email";
  else if (SOCIAL_MEDIUM.test(medium)) channel = "social";
  else if (rule) channel = rule.channel;
  else if (SEARCH_MEDIUM.test(medium)) channel = "search";
  else if (medium === "referral" || utm.utm_source || referrer.host) channel = "referral";
  else channel = "direct";

  return { source, channel };
}

/** utm_* parameters, lower case, trimmed to the column sizes. */
export function readUtm(params: URLSearchParams): Utm {
  const get = (k: string, max: number) => (params.get(k) ?? "").trim().toLowerCase().slice(0, max);
  return {
    utm_source: get("utm_source", 120) || get("ref", 120) || get("source", 120),
    utm_medium: get("utm_medium", 120),
    utm_campaign: get("utm_campaign", 160),
    utm_term: get("utm_term", 160),
    utm_content: get("utm_content", 160),
  };
}
