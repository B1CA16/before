# Auth email templates

The emails Supabase sends when someone signs in. Kept in the repo because they are product surface:
they are the first thing a new user sees, and a design that only exists pasted into a dashboard field
is a design nobody can review or restore.

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

## Provider: Brevo, because there is no custom domain yet

Volume is not the deciding factor. A handful of people signing in occasionally is a few emails a day,
and every free tier here is far above that. What decides it is whether a domain can be authenticated,
because an auth code that lands in spam is the same as one that never arrived.

There is no custom domain for this project yet, which rules out the otherwise-better option: Resend's
free tier only sends to your own address until you verify a domain with SPF and DKIM records, so it
cannot reach anyone else's inbox.

**Brevo, with a verified sender address, no domain required.** 300 emails a day, and it delivers to
any recipient.

The trade-off to know going in: when the sending domain is not DKIM-authenticated, **Brevo rewrites
the sender domain to `@brevosend.com`** so that Gmail and Yahoo still accept the mail. So the sender
lands as `beFORE <something@brevosend.com>` rather than an address on our own domain. Free webmail
addresses such as `@gmail.com` are allowed as the verified sender but are explicitly not recommended,
precisely because they fail domain alignment and trigger this rewrite.

Measured against where we started, that is still better on every axis that matters:

| | Supabase built-in | Brevo, no domain |
| --- | --- | --- |
| Templates editable | No | **Yes** |
| Recipients | Supabase org members only | **Anyone** |
| Volume | 2/hour | **300/day** |
| Inbox display name | Supabase Auth | **beFORE** |
| Sender address | `noreply@mail.app.supabase.io` | `...@brevosend.com` |

Setup: create a Brevo account, verify a sender address, generate an SMTP key, then fill in
Authentication > Emails > SMTP Settings with host `smtp-relay.brevo.com`, port `587`, username the
Brevo login email, password the SMTP key. Set the sender name to `beFORE`. Then raise the per-hour cap
under Authentication > Rate Limits, which stays at the restrictive default until changed.

### When a domain does appear

Buying one is the only paid step this project would benefit from, and it earns its keep twice: a real
URL for the app instead of `before-steel.vercel.app`, and a sender address that is genuinely ours.
Switching is then just DNS records plus new SMTP credentials, with no application code touched. Free
alternatives such as a `eu.org` subdomain exist and give real DNS control, but approval is slow and
manual.

## Keeping these in sync

Supabase's CLI can only apply templates to a **local** stack, via `content_path` entries under
`[auth.email.template.*]` in `config.toml`. Hosted projects take templates from the dashboard or the
Management API. So the honest status is that these files are the source of truth and the dashboard is
updated by hand. If they drift, trust the repo.
