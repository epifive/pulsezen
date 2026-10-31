import "server-only";
import { UAParser } from "ua-parser-js";
import type { Device } from "@/analytics/types";

/**
 * User agent → browser, major version, OS and device type.
 * Uses ua-parser-js v1 (MIT). Do not upgrade to v2: it is AGPL-licensed.
 */

export interface ParsedAgent {
  browser: string;
  browserVersion: string;
  os: string;
  device: Device;
}

const BROWSER_NAMES: Record<string, string> = {
  "Mobile Safari": "Safari",
  "Mobile Chrome": "Chrome",
  "Mobile Firefox": "Firefox",
  "Chrome WebView": "Chrome WebView",
  "Samsung Browser": "Samsung Internet",
  "Opera Mobi": "Opera",
  "Opera Touch": "Opera",
  "Opera GX": "Opera",
  "Edge": "Edge",
  "MIUI Browser": "MIUI Browser",
  "Facebook": "Facebook App",
  "Instagram": "Instagram App",
};

const OS_NAMES: Record<string, string> = {
  "Mac OS": "macOS",
  "Chromium OS": "ChromeOS",
  "Ubuntu": "Linux",
  "Debian": "Linux",
  "Fedora": "Linux",
  "Arch": "Linux",
  "Linux": "Linux",
  "HarmonyOS": "HarmonyOS",
};

const cache = new Map<string, ParsedAgent>();

export function parseUserAgent(ua: string): ParsedAgent {
  const hit = cache.get(ua);
  if (hit) return hit;
  const r = new UAParser(ua).getResult();
  const type = r.device.type;
  let device: Device = type === "mobile" || type === "wearable" ? "mobile" : type === "tablet" ? "tablet" : "desktop";
  // iPadOS reports a Mac user agent; Android tablets omit "Mobile".
  if (device === "desktop" && r.os.name === "Android") device = /Mobile/.test(ua) ? "mobile" : "tablet";
  const browser = r.browser.name ? BROWSER_NAMES[r.browser.name] ?? r.browser.name : "";
  const os = r.os.name ? OS_NAMES[r.os.name] ?? r.os.name : "";
  const parsed: ParsedAgent = {
    browser: browser.slice(0, 40),
    browserVersion: (r.browser.major ?? "").slice(0, 20),
    os: os.slice(0, 40),
    device,
  };
  if (cache.size >= 2000) cache.clear();
  cache.set(ua, parsed);
  return parsed;
}
