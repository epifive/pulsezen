# Pulsezen tracking script (`pz.js`)

A tiny (< 2 KB gzipped), dependency-free script that records pageviews and events.
It sets **no cookies**, uses **no localStorage or sessionStorage** and does **no
fingerprinting**: the server derives an anonymous visitor id from a daily-rotating
random salt, so nobody (not even the platform operator) can follow a visitor across
days or websites. No consent banner is needed for Pulsezen in most jurisdictions.

Source: `src/tracker/index.ts`, built to `public/pz.js` by `scripts/build-widget.mjs`
(runs automatically before `next dev` / `next build`, or `npm run widget:build`).

## Installation

Paste the snippet into the `<head>` of every page (replace the domain and the key with
the values shown on the site's settings page):

```html
<script defer src="https://analytics.example.com/pz.js" data-site="YOUR_SITE_KEY"></script>
```

Single-page apps (React, Vue, Next.js, Nuxt, SvelteKit, Angular …) need nothing extra:
navigation through `history.pushState` / `replaceState` and the back / forward buttons
is tracked automatically.

## Options

All options are `data-*` attributes on the script tag.

| Attribute | Default | Description |
| --- | --- | --- |
| `data-site` | (required) | The site key. |
| `data-api` | `<script origin>/api/event` | Endpoint the events are sent to. Use it with a first-party proxy (see below). |
| `data-exclude` | none | Comma-separated path patterns that are not tracked, `*` matches anything: `data-exclude="/admin/*, /preview/*"`. |
| `data-hash` | off | Hash-based routing: `#/page` changes are tracked as pageviews (path stored as `/#/page`). Also enable "Hash routing" in the site settings. |
| `data-outbound` | on | Sends an `Outbound Link` event (`url` property) when a link to another website is clicked. `data-outbound="false"` turns it off. |
| `data-downloads` | on | Sends a `File Download` event (`url` property) for links to files: pdf, zip, rar, 7z, gz, doc(x), xls(x), ppt(x), csv, txt, epub, mp3, wav, mp4, mov, avi, mkv, dmg, pkg, exe, msi, apk, iso, deb, rpm … `data-downloads="false"` turns it off; `data-downloads="pdf,zip"` tracks only those extensions. |
| `data-404` | off | Put it on your "page not found" template: the page sends a `404` event instead of a pageview, so broken links show up under Goals / Events. |
| `data-respect-dnt` | off | Do not track visitors whose browser sends "Do Not Track". |
| `data-allow-localhost` | off | Track pages served from `localhost` / `127.0.0.1` (also enable "Count localhost" in the site settings). Without it the script does nothing on localhost and `file:` pages. |

The script never tracks automated browsers (`navigator.webdriver`, Cypress, PhantomJS,
Nightmare) and waits until a prerendered page is actually shown. Known bots, crawlers,
link previews and prefetches are also filtered out on the server.

## Custom events

```js
pulsezen("Signup");
pulsezen("Signup", { props: { plan: "Pro", source: "pricing-page" } });
pulsezen("Purchase", { props: { plan: "Pro" }, revenue: { amount: 49.99, currency: "USD" } });
pulsezen("Download", { callback: () => (location.href = "/thanks") });
```

- `props`: up to 20 properties; keys up to 40 characters, values (string, number or
  boolean) up to 200 characters. Keys starting with `$` are reserved.
- `revenue`: amount in major units (49.99) and an ISO 4217 currency code. Stored in
  cents, with the currency in the reserved `$currency` property.
- `callback`: called once the event has been handed to the browser.

To send events before `pz.js` has loaded (e.g. from an inline script), add this
one-liner before the snippet; queued calls are sent once the script loads:

```html
<script>window.pulsezen=window.pulsezen||function(){(window.pulsezen.q=window.pulsezen.q||[]).push(arguments)}</script>
```

### Events without JavaScript: CSS classes

Add `pulsezen-event-name=EVENT_NAME` to the class list of a link, button or form
(use `+` for spaces). Extra `pulsezen-event-KEY=VALUE` classes become properties:

```html
<a href="/signup" class="button pulsezen-event-name=Signup+Click pulsezen-event-plan=pro">Start free</a>
<form action="/subscribe" method="post" class="pulsezen-event-name=Newsletter">…</form>
```

Links, buttons and other elements send the event when they (or something inside them)
are clicked. On a `<form>` the event is sent when the form is submitted (after the
browser's validation passed), not on clicks inside it.

Then create a goal with the same event name in the dashboard to see conversions.
Event names are case-sensitive (`Signup` and `signup` are different events).

## First-party proxy (optional)

Some ad blockers block third-party analytics domains. Serving the script and the
endpoint from your own domain avoids that. Point `src` and `data-api` at your proxy:

```html
<script defer src="/stats/js/script.js" data-api="/stats/api/event" data-site="YOUR_SITE_KEY"></script>
```

The proxy must forward the visitor's IP address in `X-Forwarded-For` (all examples
below do): Pulsezen uses the first address of that header for the anonymous visitor
id and the location, so without it every visitor would look like the proxy.
For proxied events the location comes only from the platform's GeoIP file (looked up
with the forwarded visitor IP); Vercel / Cloudflare location headers are ignored there
because they describe the proxy server. Without a GeoIP file, proxied events have no
country. Replace `analytics.example.com` with your Pulsezen domain.

**Next.js** (`next.config.js`):

```js
module.exports = {
  async rewrites() {
    return [
      { source: "/stats/js/script.js", destination: "https://analytics.example.com/pz.js" },
      { source: "/stats/api/event", destination: "https://analytics.example.com/api/event" },
    ];
  },
};
```

**Nginx**:

```nginx
location = /stats/js/script.js {
  proxy_pass https://analytics.example.com/pz.js;
  proxy_set_header Host analytics.example.com;
  proxy_ssl_server_name on;
  proxy_buffering on;
  expires 1h;
}

location = /stats/api/event {
  proxy_pass https://analytics.example.com/api/event;
  proxy_set_header Host analytics.example.com;
  proxy_ssl_server_name on;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering on;
}
```

**Cloudflare Worker** (route it on `example.com/stats/*`):

```js
const PULSEZEN = "https://analytics.example.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/stats/js/script.js") {
      let response = await caches.default.match(request);
      if (!response) {
        response = await fetch(PULSEZEN + "/pz.js");
        ctx.waitUntil(caches.default.put(request, response.clone()));
      }
      return response;
    }
    if (url.pathname === "/stats/api/event") {
      const proxied = new Request(PULSEZEN + "/api/event", request);
      proxied.headers.delete("cookie");
      proxied.headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
      return fetch(proxied);
    }
    return fetch(request);
  },
};
```

**Netlify** (`_redirects`):

```
/stats/js/script.js  https://analytics.example.com/pz.js         200
/stats/api/event     https://analytics.example.com/api/event     200
```

(Netlify forwards the visitor address in `X-Forwarded-For` automatically.)

## What is sent

One small `POST` per event (`navigator.sendBeacon`, or `fetch` with `keepalive` and
`credentials: "omit"`), body `text/plain` JSON, at most 2 KB:

```json
{ "n": "pageview", "u": "https://example.com/pricing?utm_source=x", "d": "SITE_KEY", "r": "https://www.google.com/", "w": 1440 }
```

`n` event name, `u` page URL (the hash is only included with `data-hash`), `d` site
key, `r` referrer, `w` viewport width, optional `p` properties, `$` revenue and
`h` (1 on `data-404` pages). The full contract is `TrackPayload` in
`src/analytics/types.ts`.

`POST /api/event` answers `202` with no body when the event is accepted or silently
ignored (bots, excluded paths / IPs, over the plan limit), and `400` (invalid payload),
`403` (the page's hostname is not one of the site's domains), `404` (unknown site key),
`413` (larger than 2 KB), `415` (wrong content type) or `429` (too many events) with
`{ "error": "..." }`. The endpoint allows any origin (`Access-Control-Allow-Origin: *`,
no credentials); the page hostname is checked against the site's domain, its subdomains
and the extra domains in the site settings instead.

Server-side environment variables: `EVENT_RATE_LIMIT_PER_MIN` (per visitor IP and
site, default 120) and `EVENT_PROXY_RATE_LIMIT_PER_MIN` (per connecting IP and site when
the request comes through a proxy, default 600; both limits apply to proxied events).
Raise the proxy limit when a busy website sends more than about 10 events per second
through its proxy. It is kept moderate because `X-Forwarded-For` can be forged.

Like every web analytics collector, the endpoint is public: anyone who knows a site key
can send made-up events for that site's hostnames (requests without an `Origin` header
are accepted, because servers and proxies may strip it). The rate limits and bot
filtering keep this bounded.
