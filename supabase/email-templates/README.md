# Auth email templates

> **Status: not in use.** The app signs in with Google, so no auth email is sent at all. See
> `docs/adr/0005-google-sign-in-instead-of-email.md`. These templates are finished and correct; the
> only missing piece is a domain to send from. Everything below applies from the moment one exists,
> at which point setting `NEXT_PUBLIC_EMAIL_SIGNIN=1` re-enables the email option in the UI.

The emails Supabase sends when someone signs in with a code. Kept in the repo because they are product
surface: they are the first thing a new user sees, and a design that only exists pasted into a
dashboard field is a design nobody can review or restore.

| File | Dashboard template | Suggested subject |
| --- | --- | --- |
| `magic-link.html` | Authentication > Emails > Templates > **Magic Link** | Your beFORE sign-in code |
| `confirm-signup.html` | Authentication > Emails > Templates > **Confirm signup** | Your beFORE sign-in code |

Paste the file contents into the matching template and save. Both are needed: Supabase picks the
signup template for an address it has never seen and the magic-link one for a returning address, so
skipping either leaves half your users with the stock email.

## Custom SMTP is a prerequisite, not an upgrade

**Since 3 June 2026, free-tier projects on Supabase's built-in email service cannot edit templates at
all.** The fields are read-only. Supabase made the change because free projects were being spun up,
their auth templates rewritten as phishing pages, and the mail sent from Supabase's own SMTP
reputation. Projects created before that date keep their templates; this one was created on
21 July 2026, so it is affected.

Configuring custom SMTP restores template editing on any plan. That is worth being explicit about,
because it means three things that look like separate wishes are really one task:

1. Editing these templates at all.
2. Changing the sender away from `Supabase Auth <noreply@mail.app.supabase.io>`.
3. Sending to anyone who is not a member of the Supabase organisation.

Until SMTP is configured, **the app cannot be signed into**, because it asks for a 6-digit code while
the uneditable stock template still sends a link.

## The template is what makes the code flow work

This is the non-obvious part. The client calls the same `signInWithOtp` either way. **Whether the
user receives a tappable link or a 6-digit code is decided by the template**, not by the API call:

- `{{ .ConfirmationURL }}` renders a link, and following it hands the browser a session.
- `{{ .Token }}` renders the 6-digit code, which the app exchanges through `verifyOtp`.

Our templates use `{{ .Token }}` and contain no link at all. If someone pastes a stock template back
in, the app will keep asking for a code that the email no longer contains, and sign-in will look
broken for a reason that is nowhere near the code that appears to be at fault.

We moved off links deliberately, for two reasons:

1. The old flow put the access token **and the refresh token** in the URL fragment, so they reached
   browser history and anywhere a URL gets pasted. A refresh token is long-lived: it mints new access
   tokens until it is revoked.
2. The safer PKCE variant of a link still breaks on phones. The verifier lives in the browser that
   requested the link, and mail apps routinely open links in a different browser or an in-app
   webview, where sign-in then fails with an error the user cannot act on.

## The logo asset

The wordmark is `apps/web/public/before_wordmark_email.png`, referenced by absolute URL from the
deployed web app. It is a PNG and not the SVG we use in the interface, because **Gmail, Outlook and
Yahoo all strip SVG from email**, so `before_logo_text.svg` would simply render as nothing.

Two consequences worth holding onto:

- **The asset must be deployed before the emails look right.** The template points at production, so
  a template pasted into the dashboard before the app ships that file shows a broken image. There is
  no local fallback: recipients fetch it from the internet.
- **Never rename or delete it.** Emails outlive deployments. Removing that path breaks the logo
  retroactively in every message already sitting in someone's inbox. Alt text reads "beFORE", which
  is what clients that block remote images will show instead.

To regenerate after a logo change, rasterise the dark wordmark at 2x the display size (108x40 becomes
216x80) with a transparent background. Any rasteriser works; the app already has Playwright:

```js
// run from apps/web
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const W = 216, H = 80;
const svg = await readFile("public/before_logo_text.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(`<body style="margin:0"><div id="w" style="width:${W}px;height:${H}px">${svg}</div></body>`);
await page.$eval("#w svg", (el, [w, h]) => { el.setAttribute("width", w); el.setAttribute("height", h); }, [W, H]);
await page.locator("#w").screenshot({ path: "public/before_wordmark_email.png", omitBackground: true });
await browser.close();
```

Use `before_logo_text.svg` (near-black `#090e18`), not `before_logo_text_light.svg`, which is the
light-on-dark variant and would be invisible on these light surfaces.

To preview a template locally, substitute `{{ .Token }}` and inline the PNG as a `data:` URI. Loading
it from a `file://` path does not work, because page content set programmatically runs at a null
origin and cannot read local files.

## The default service, for the record

Mail arrives from `Supabase Auth <noreply@mail.app.supabase.io>`, capped at **2 emails per hour**, and
delivered **only to members of the Supabase organisation**. Every other address fails outright with
"Email address not authorized", which is a refusal rather than a rate limit: waiting does not help.
That alone blocks inviting a few surfing friends to log sessions, which is one of the main levers for
collecting enough labels to train on.

## Provider: Gmail SMTP, until there is a domain

Volume is not the deciding factor. A handful of people signing in occasionally is a few emails a day,
and every free tier here is far above that. What decides it is **whether the provider will send at all
without a verified domain**, and for the obvious candidates the answer is no:

- **Resend** only delivers to your own account address until a domain is verified with SPF and DKIM,
  so it cannot reach anyone else's inbox.
- **Brevo** requires manual account approval before transactional SMTP is enabled, and will not
  approve it until at least one domain is verified. Expect a 1 to 2 business day review. Attempting
  to send before then fails, and Supabase surfaces that as a bare
  `500 unexpected_failure: Error sending magic link email`.

Both were rejected for the same reason: there is no domain for this project yet.

**Gmail SMTP with an app password.** No domain, no approval queue, works immediately, 500 emails a day
on a rolling 24 hours, which is far beyond anything this project will send.

There is a neat property here that is easy to miss. Routing a `@gmail.com` sender through a third
party like Brevo *fails* SPF and DKIM alignment, which is exactly why Brevo rewrites the sender to
`@brevosend.com`. Sending that same address through **Google's own servers** aligns and signs
correctly. So this path gives both better deliverability and a more honest sender address than the
third-party route it replaces.

| | Supabase built-in | Gmail SMTP |
| --- | --- | --- |
| Templates editable | No | **Yes** |
| Recipients | Supabase org members only | **Anyone** |
| Volume | 2/hour | **500/day** |
| Inbox display name | Supabase Auth | **beFORE** |
| Sender address | `noreply@mail.app.supabase.io` | your Gmail address |
| SPF and DKIM | n/a | **Aligned, signed by Google** |

Setup. Google removed plain-password SMTP access in May 2025, so an app password is mandatory and it
requires 2-Step Verification on the account:

1. Google Account > Security > enable 2-Step Verification if it is off.
2. Google Account > Security > App passwords > create one for Mail. It is 16 characters; paste it
   without spaces.
3. Supabase > Authentication > Emails > SMTP Settings: host `smtp.gmail.com`, port `587`, username
   your full Gmail address, password the app password. **Sender email must be that same Gmail
   address**, because Gmail refuses to send as an address the authenticated account does not own.
   Sender name `beFORE`.
4. Authentication > Rate Limits: raise the per-hour cap, which stays at the restrictive default.

The honest limitation: the sender is a personal `@gmail.com` address, not a brand domain, and a
personal Google account is not a production mail platform. It is entirely adequate for a portfolio
project with a handful of users, and it is the only option here that works today.

### When a domain does appear

Buying one is the only paid step this project would benefit from, and it earns its keep twice: a real
URL for the app instead of `before-steel.vercel.app`, and a sender address that is genuinely ours. At
that point Resend becomes the better choice, and switching is DNS records plus new SMTP credentials
with no application code touched. Free alternatives such as a `eu.org` subdomain give real DNS
control, but approval is slow and manual.

## Keeping these in sync

Supabase's CLI can only apply templates to a **local** stack, via `content_path` entries under
`[auth.email.template.*]` in `config.toml`. Hosted projects take templates from the dashboard or the
Management API. So the honest status is that these files are the source of truth and the dashboard is
updated by hand. If they drift, trust the repo.
