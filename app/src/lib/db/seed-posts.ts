/** Starter blog posts created on install (Admin → Blog). Markdown. */
export const DEFAULT_POSTS = [
  {
    slug: "cookieless-analytics-explained",
    title: "Cookieless analytics explained: how to count visitors without tracking them",
    excerpt: "Cookies used to be the only way to count unique visitors. Here is how modern, privacy-friendly analytics does it without cookies, and what you give up (very little).",
    metaDescription: "How cookieless website analytics counts unique visitors with a daily rotating hash, why it needs no personal data, and how it compares to cookie-based tools.",
    content: `## Why analytics used cookies in the first place

Classic analytics tools put a cookie with a random ID on every visitor's device. Each time the visitor came back, the tool read the ID and knew it was the same person — today, next week and next year, often across many websites.

That makes counting easy, but it also means a long-lived identifier on someone's device, a consent banner on almost every website, and a lot of data that most site owners never look at.

## How cookieless analytics counts visitors

Cookieless analytics answers a narrower question: *how many different people visited today?* It doesn't need to recognise anyone tomorrow to answer that.

For every pageview the server calculates a one-way hash from:

- the visitor's IP address,
- the browser's user agent,
- the website,
- and a random **salt** that is replaced every day.

Two pageviews from the same browser on the same day produce the same hash, so they are counted as one visitor. The IP address itself is thrown away, and because the salt changes daily (and old salts are deleted), the same person gets a completely unrelated hash tomorrow. Nobody — not even the people running the analytics — can follow a visitor from one day to the next.

## What you still get

Almost everything you actually use:

- unique visitors, visits and pageviews,
- bounce rate and visit duration,
- top pages, entry and exit pages,
- referrers, search engines, social networks and AI assistants,
- campaigns (UTM tags), countries, devices, browsers and operating systems,
- goals, conversion rates and revenue.

## What you give up

- **Returning visitors across days.** A person who visits on Monday and Thursday counts as one visitor each day. Over a week this is summed, which is how most privacy-friendly tools report it.
- **Cross-device journeys.** Phone and laptop are always two visitors. Cookie-based tools mostly can't join them either without a login.

For most websites these are small trade-offs for not tracking people.

## Do you still need a cookie banner?

A tool that sets no cookies and stores no personal data doesn't need consent in many countries. Rules differ, though, and other tools on your site (chat widgets, ads, embedded videos) may still need it. Check what your local law requires, and mention your analytics in your privacy policy either way.

## The bottom line

Cookieless analytics gives you clear, trustworthy numbers while respecting your visitors. Your pages load faster, your privacy policy gets shorter, and your visitors are not followed around the web.`,
  },
  {
    slug: "track-chatgpt-ai-traffic",
    title: "How to track visitors from ChatGPT and other AI assistants",
    excerpt: "People increasingly ask ChatGPT, Perplexity or Gemini instead of Google. Here is how to see how much traffic AI assistants send you, and how to get more of it.",
    metaDescription: "Learn how to measure website traffic from ChatGPT, Perplexity, Gemini, Claude and Copilot, why some of it looks like direct traffic, and how to grow it.",
    content: `## AI assistants are a new traffic source

When an AI assistant answers a question, it often links to the pages it used. People click those links — and for many websites this is now a noticeable, fast-growing source of visitors, especially for guides, tools and product pages.

The question is how much of your traffic comes from AI, and which pages it lands on.

## How AI traffic is recognised

When someone clicks a link in ChatGPT, Perplexity or Gemini, the browser usually tells your website where the visitor came from (the *referrer*), for example \`chatgpt.com\` or \`perplexity.ai\`. Some assistants also add a campaign tag such as \`utm_source=chatgpt.com\` to the link.

Our analytics reads both and puts these visits in their own **AI assistants** channel, next to search, social, email and referrals. Each assistant is listed by name: ChatGPT, Perplexity, Gemini, Claude, Copilot, DeepSeek, Grok, Meta AI, Mistral and more.

## Why some AI traffic looks like direct traffic

Not every AI app sends a referrer. Desktop and mobile apps in particular often open links without one, so those visits appear as **direct** traffic. Two tips:

- Watch for direct traffic landing on deep pages (a long blog post rather than your home page) — that is often AI or messaging apps.
- Compare trends: if AI traffic and direct traffic to the same pages grow together, part of that direct traffic is probably AI too.

## Where to look in your dashboard

1. In the **Sources** card, open the *Channels* tab and find *AI assistants*, or open the *AI assistants* tab to see each assistant by name. Compare with the previous period to see the trend.
2. Click the channel to filter the whole dashboard. Now **Top pages** shows which pages AI assistants send people to.
3. Add a goal (for example a sign-up or purchase) to see how AI visitors convert compared with search visitors.

## How to get more AI traffic

- **Answer questions directly.** Clear headings and a short, direct answer near the top make your page easy to quote.
- **Keep facts current.** Prices, versions and dates that are out of date are less likely to be cited.
- **Be the original source.** Unique data, examples and tools get linked more than rewritten summaries.
- **Let crawlers in.** Check that your robots.txt doesn't block the AI crawlers you want to be found by.

AI search is still young. Measuring it now means you'll see the trend early — and know which content earns those visits.`,
  },
  {
    slug: "5-metrics-that-matter",
    title: "5 metrics that matter for small websites (and the ones you can ignore)",
    excerpt: "You don't need 200 reports. These five numbers tell you whether your website is working, and what to do next.",
    metaDescription: "The five website analytics metrics that matter for small businesses and blogs: visitors, top pages, sources, conversion rate and bounce rate — and how to act on them.",
    content: `Most website owners open their analytics, see a wall of numbers and close it again. The good news: for a small website, five metrics answer almost every question.

## 1. Unique visitors — are more people finding you?

The number of different people who visited. Don't stare at single days; compare this month with last month, or this week with the same week last year. A steady upward line is the best sign that your website is working.

**Act on it:** when the trend flattens, look at the next two metrics to find out why.

## 2. Top pages — what do people actually read?

Your top pages show what your visitors care about. Often it's a page you didn't expect: an old blog post, a pricing page or a how-to guide.

**Act on it:** improve and update your top pages first, link from them to the pages that make you money, and write more about the topics that work.

## 3. Sources — where do visitors come from?

Search, social networks, newsletters, referrals from other websites and, more and more, AI assistants like ChatGPT. Knowing your best sources tells you where to spend your time.

**Act on it:** double down on the source that grows fastest. Tag your own links (newsletters, social posts, ads) with UTM campaign tags so you can compare them fairly.

## 4. Conversion rate — do visitors do what you want?

Traffic is only useful if people take action: sign up, buy, book a call or send a message. Set these up as **goals** and watch the share of visitors who complete them.

**Act on it:** compare the conversion rate by source and by entry page. A small source that converts twice as well deserves more attention than a big one that never converts.

## 5. Bounce rate — do people find what they came for?

The share of visits that saw only one page. A high bounce rate on a blog post can be fine (the reader got the answer). On a home page or landing page it usually means something is off: a slow page, a confusing message or the wrong audience.

**Act on it:** check bounce rate by page and by source, not just the average.

## Numbers you can safely ignore

- **Pageviews on their own.** They grow when people click around confused, too. Visitors and conversions tell you more.
- **Daily ups and downs.** Weekends, holidays and one viral post make single days noisy. Look at weeks and months.
- **Vanity totals.** "1 million pageviews since 2019" feels good but doesn't tell you what to do next.

## Make it a habit

Pick one moment each week — a weekly email report makes it effortless — and check these five numbers. Ten minutes a week is enough to spot problems early and see what's working.`,
  },
];
