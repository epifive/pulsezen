/**
 * Pulsezen tracking script, bundled by scripts/build-widget.mjs into public/pz.js (budget: 2 KB gzip).
 *
 *   <script defer src="https://PLATFORM/pz.js" data-site="KEY"></script>
 *
 * No cookies, no localStorage, no fingerprinting: the server derives a daily-rotating
 * anonymous hash. See src/tracker/README.md for the options and the events API.
 * Payload format: TrackPayload in src/analytics/types.ts. Never throws.
 */

import type { TrackPayload } from "../analytics/types";

interface EventOptions {
  props?: Record<string, string | number | boolean>;
  revenue?: { amount: number; currency: string };
  callback?: () => void;
}

type Queued = { q?: IArguments[] };
type PulsezenFn = ((name: string, options?: EventOptions) => void) & Queued;

const DOWNLOADS = "pdf,zip,rar,7z,gz,tgz,doc,docx,xls,xlsx,ppt,pptx,csv,txt,rtf,odt,ods,epub,mp3,wav,mp4,mov,avi,mkv,dmg,pkg,exe,msi,apk,iso,deb,rpm";

(() => {
  try {
    const w = window as Window & { pulsezen?: PulsezenFn; Cypress?: unknown; _phantom?: unknown; __nightmare?: unknown };
    const d = document;
    const l = location;
    const n = navigator as Navigator & { doNotTrack?: string | null };
    const script = d.currentScript as HTMLScriptElement | null;
    if (!script) return;
    const attr = (k: string) => script.getAttribute("data-" + k);
    const site = attr("site") || "";
    const api = attr("api") || new URL(script.src).origin + "/api/event";
    const globs = (attr("exclude") || "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean)
      .map((g) => new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
    const hashMode = attr("hash") !== null;
    const outbound = attr("outbound") !== "false";
    const dl = attr("downloads");
    const exts = dl === "false" ? [] : (dl && dl !== "true" ? dl : DOWNLOADS).split(",");
    const notFound = attr("404") !== null;

    const skip =
      !site ||
      n.webdriver ||
      w.Cypress ||
      w._phantom ||
      w.__nightmare ||
      (attr("respect-dnt") !== null && (n.doNotTrack === "1" || (w as unknown as { doNotTrack?: string }).doNotTrack === "1")) ||
      (attr("allow-localhost") === null && (l.protocol === "file:" || /^(localhost|\[::1\]|0\.0\.0\.0|127(\.\d+){3})$|\.localhost$/.test(l.hostname)));

    const send = (name: string, o?: EventOptions) => {
      const done = () => {
        if (o && o.callback) o.callback();
      };
      if (skip || globs.some((re) => re.test(l.pathname))) return done();
      const p: TrackPayload = { n: name, u: hashMode ? l.href : l.href.split("#")[0], d: site, r: d.referrer || "", w: w.innerWidth };
      if (o && o.props) p.p = o.props as Record<string, string>;
      if (o && o.revenue) p.$ = o.revenue;
      if (name === "404") p.h = 1;
      const body = JSON.stringify(p);
      try {
        if (n.sendBeacon && n.sendBeacon(api, body)) return done();
      } catch {
        // fall through to fetch
      }
      fetch(api, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } }).then(done, done);
    };

    let last = "";
    const page = () => {
      const key = l.pathname + (hashMode ? l.hash : "");
      if (key === last) return;
      last = key;
      send(notFound ? "404" : "pageview");
    };

    // Public API + calls queued before the script loaded.
    const queue = (w.pulsezen && w.pulsezen.q) || [];
    w.pulsezen = (name, options) => {
      try {
        send(name, options);
      } catch {
        // never break the page
      }
    };

    // Single-page apps.
    const h = history;
    for (const m of ["pushState", "replaceState"] as const) {
      const orig = h[m];
      h[m] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const r = orig.apply(this, args);
        try {
          page();
        } catch {
          // ignore
        }
        return r;
      };
    }
    w.addEventListener("popstate", page);
    if (hashMode) w.addEventListener("hashchange", page);

    // class="pulsezen-event-name=Signup pulsezen-event-plan=pro": true when the element has one (and it was sent).
    const classEvent = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className : "";
      const m = cls.match(/pulsezen-event-name=(\S+)/);
      if (!m) return false;
      const props: Record<string, string> = {};
      cls.replace(/pulsezen-event-(?!name=)([^=\s]+)=(\S+)/g, (_, k: string, v: string) => (props[k] = v.replace(/\+/g, " ")));
      send(m[1].replace(/\+/g, " "), { props });
      return true;
    };

    // Outbound links, file downloads and class-based events (forms: on submit, below).
    const click = (e: MouseEvent) => {
      try {
        if (e.type === "auxclick" && e.button !== 1) return;
        let el = e.target as Element | null;
        let link: HTMLAnchorElement | null = null;
        for (let i = 0; el && i < 6; i++, el = el.parentElement) {
          if (!link && el.tagName === "A" && (el as HTMLAnchorElement).href) link = el as HTMLAnchorElement;
          if (el.tagName !== "FORM" && classEvent(el)) return;
        }
        if (!link || !/^https?:$/.test(link.protocol)) return;
        const ext = (link.pathname.split(".").pop() || "").toLowerCase();
        if (exts.length && link.pathname.indexOf(".") > -1 && exts.indexOf(ext) > -1) send("File Download", { props: { url: link.href } });
        else if (outbound && link.host !== l.host) send("Outbound Link", { props: { url: link.href } });
      } catch {
        // ignore
      }
    };
    d.addEventListener("click", click, true);
    d.addEventListener("auxclick", click, true);
    d.addEventListener(
      "submit",
      (e) => {
        try {
          const f = e.target as Element;
          if (f.tagName === "FORM") classEvent(f);
        } catch {
          // ignore
        }
      },
      true,
    );

    // Wait until a prerendered page is actually shown.
    if (d.visibilityState === ("prerender" as DocumentVisibilityState)) {
      const onShow = () => {
        if (d.visibilityState === "visible") {
          d.removeEventListener("visibilitychange", onShow);
          page();
        }
      };
      d.addEventListener("visibilitychange", onShow);
    } else page();

    // Calls made before the script loaded (after the first pageview, so visits start with it).
    for (const args of queue) w.pulsezen(args[0], args[1]);
  } catch {
    // never break the page
  }
})();
