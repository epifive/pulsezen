/**
 * Default content pages created on install. Operators edit them from
 * Admin → Pages. `{site_name}` and `{site_email}` are replaced when rendered.
 * They are a starting point, not legal advice: operators should adapt them to their
 * business and the laws that apply to them.
 */
export const DEFAULT_PAGES = [
  {
    slug: "about",
    title: "About Us",
    metaDescription: "{site_name} is simple, privacy-friendly website analytics: the numbers you need, without cookies or creepy tracking.",
    content: `## Who we are

{site_name} is website analytics for people who want clear answers, not a 200-report maze. Add one small script to your website and see how many people visit, which pages they read, where they come from and what they do.

## What we believe

- **Privacy is not optional.** {site_name} sets no cookies and never stores IP addresses. Visitors are counted with an anonymous hash that changes every day, so nobody can be followed across days or websites.
- **Simple beats complete.** Every number that matters fits on one screen that anyone on your team can read in seconds.
- **Your data is yours.** We don't sell it, share it with advertisers or use it to build profiles. Export it whenever you like.
- **Fast websites win.** Our script is under 2 KB, so it never slows your pages down.

## Built for the way people find you today

Search engines are no longer the only way in. {site_name} also shows visits from AI assistants such as ChatGPT, Perplexity and Gemini, alongside search, social, email, campaigns and referrals.

## Who uses {site_name}

Small businesses, bloggers, online shops, startups, agencies and freelancers who look after many client websites from one account.

## Contact

Questions or ideas? [Get in touch](/contact) — we read every message.`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    metaDescription: "How {site_name} handles the data of its customers and of the visitors of websites that use {site_name}.",
    content: `## Overview

This Privacy Policy explains how {site_name} ("we", "us") handles information. We deal with two very different groups of people:

1. **Our customers** — people who create an account to see analytics for their websites.
2. **Website visitors** — people who visit a website that uses {site_name} to measure its traffic.

We collect as little as possible about both groups.

## Information about our customers

When you create an account we store your name, email address and a securely hashed password. While you use {site_name} we also store what you set up in it: the websites you add, goals, shared dashboards, API keys, email report recipients and alert channels (for example a Slack webhook address or a Telegram chat ID).

If you buy a plan, payments are handled by the payment provider you choose. We receive a confirmation and the amount paid; we never see or store full card numbers.

If you write to us through the contact form we keep your message so we can answer it.

## Information about website visitors

Website owners add our tracking script to their pages. For each pageview or event the script sends:

- the page address, **without** its query string (campaign tags such as utm_source are kept),
- the referring website and campaign tags,
- the browser's user agent, language and screen width.

From this we derive and store the browser, operating system, device type (desktop, mobile or tablet) and the visitor's country, region and city, looked up from the IP address at the moment of the visit.

**What we do not store:** the IP address, the full user agent string, cookies or any identifier on the visitor's device. The script does not use cookies or local storage and does not follow anyone across websites.

**How visitors are counted:** to tell how many different people visited, we calculate a one-way hash (SHA-256) of the IP address, the user agent, the website and a random salt. A new salt is created every day and old salts are deleted, so the same person gets an unrelated hash the next day and visits cannot be linked across days or websites. The hash cannot be turned back into an IP address.

Website owners can also send custom events (for example "Sign-up") with properties and revenue amounts. They must not send personal data such as names or email addresses in events, properties or page addresses.

## How long we keep data

Detailed visitor events are kept for the data retention period of the website owner's plan (shown on the pricing page) and then deleted. Before deletion they are summarised into daily totals (for example "120 visitors from Germany on 3 March"), which contain no visitor hashes and are kept for as long as the website exists in {site_name}.

When a customer deletes a website, all of its data is deleted. When an account is deleted, its websites and their data are deleted too.

## Who is responsible for visitor data

The owner of each website decides to use {site_name} and what to measure. For the data of their visitors we act on their behalf, as a service provider. Website owners are responsible for telling their visitors that they use {site_name} (for example in their own privacy policy) and for following the laws that apply to their website. {site_name} is designed for privacy, but rules differ between countries, so website owners should check what their local law requires.

## Cookies on this website

We only use the cookies needed to run this website: one keeps you signed in, one remembers your language and, for password-protected shared dashboards, one remembers that you entered the password. Your theme and cookie notice choices are saved in your browser's local storage. We don't use advertising cookies.

We may measure visits to our own public pages with {site_name} itself, which sets no cookies.

## Sharing

We don't sell data and don't share it with advertisers. We only share what is needed with the services that help us run {site_name}: our hosting provider, our email delivery provider and the payment provider you choose. Alerts and reports are sent only to the channels and addresses you set up.

## Security

Passwords are hashed, connections are encrypted and access to our servers is restricted. No system is perfectly secure, but we work hard to protect your data.

## Your rights

You can see and change your account details at any time from your account page, export your statistics, and delete websites or your whole account. Website visitors who have a question about a website that uses {site_name} should contact that website's owner first; we will help the owner answer.

## Changes

We may update this policy. For important changes we will let customers know by email.

## Contact

For privacy questions contact us at {site_email}.`,
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    metaDescription: "The terms that apply when you use {site_name}.",
    content: `## Acceptance

By creating an account or using {site_name} you agree to these terms. If you use {site_name} for a company, you confirm that you may accept these terms on its behalf.

## Your account

Keep your login details and API keys safe. You are responsible for everything done with your account.

## Acceptable use

- Only add the tracking script to websites you own or manage.
- Tell your visitors that you use {site_name}, for example in your privacy policy, and follow the laws that apply to your website.
- Never send personal data (names, email addresses, phone numbers, account IDs) in page addresses, custom events or event properties.
- Do not use {site_name} to send spam, fake traffic or attacks, or to overload our service or anyone else's.

We may suspend accounts that break these rules.

## Plans, limits and payments

Plan limits — number of websites, monthly pageviews and data retention — are shown on the pricing page. When an account goes well over its monthly pageview limit, new events may stop being recorded until the next month or until you upgrade. Paid plans renew or expire according to the billing period you chose. You can change or cancel your plan at any time; already paid periods are not refunded unless the law requires it.

## Your data

Your statistics belong to you. You can export them and delete them at any time. We only use them to provide {site_name} to you, as described in our [Privacy Policy](/p/privacy-policy).

## Availability and accuracy

We work hard to keep {site_name} available and accurate, but analytics are never perfect: ad blockers, browsers without JavaScript and apps that hide the referrer can all make numbers differ from other tools. The service is provided "as is", without warranties of any kind, and our liability is limited to the amount you paid us in the last 12 months.

## Changes

We may update these terms. We will let customers know about important changes; continued use after a change means you accept the new terms.

## Contact

Questions about these terms? Write to {site_email}.`,
  },
];
