# ADR 0005: Google sign-in instead of email

- Status: accepted
- Date: 2026-08-18

## Context

M7 needs accounts, so that a logged surf session belongs to somebody and ratings can become training
labels. Email sign-in was built first: a 6-digit code, with branded templates in
`supabase/email-templates/`. It does not work, and the reason is not a bug in it.

Sending any auth email requires an SMTP sender, and every free option needs a domain this project
does not own:

- **Supabase's built-in service** delivers only to members of the Supabase organisation, capped at 2
  per hour, and since 3 June 2026 does not allow template editing at all on new free projects.
- **Resend** delivers only to your own account address until a domain is verified with SPF and DKIM.
- **Brevo** will not enable transactional SMTP until a domain is verified and an account review
  passes, taking 1 to 2 business days. Sending before that returns
  `500 unexpected_failure: Error sending magic link email`, which is what we hit.

The remaining no-domain option was Gmail SMTP with an app password. Technically fine, and better
aligned than the third-party routes because Google signs its own domain, but it means sending product
mail from a personal mailbox, which is not a reasonable thing to build on.

Verifying an email address was never worth much here anyway. Sessions are surf ratings scoped by
`user_id` under row level security, so an unverified or squatted address exposes nothing, and there
are no email-driven features. The real cost of skipping verification is a password reset path that
needs email, and typos that silently strand an account.

## Decision

Sign in with **Google OAuth**. No message is sent, so the sender problem disappears rather than being
worked around, and Google has already verified the address, so verification is retained for free
rather than traded away.

`flowType: 'pkce'` with `detectSessionInUrl: true`. Those two belong together and the pairing is the
point: the redirect returns a single-use authorization code, worthless without the verifier in this
browser's storage. The flow this replaced was implicit, which put the access **and refresh** token in
the address bar, where they reach browser history and get pasted into chat windows. A leaked refresh
token is the serious half, because it mints new access tokens until revoked.

The email code flow is **kept but dormant**, behind `NEXT_PUBLIC_EMAIL_SIGNIN`, off by default.

## Consequences

- No email infrastructure at all, which also removes the sender, the templates, the rate limits and
  the redirect allowlist from the list of things that can break sign-in.
- Better on mobile, which is the case that matters: one tap, rather than switching to an inbox and
  copying a code back. This app gets used in a car park before a session.
- No passwords, so nothing to store, validate, or reset.
- **Requires a Google account.** Acceptable for the target users, and revisitable: adding another
  provider later is a dashboard toggle plus a button.
- Setup lives outside the repo: a Google Cloud OAuth client, with the authorised redirect URI pointing
  at Supabase's callback rather than at our own app. That last detail is the usual cause of a failed
  first attempt.
- The dormant email path is off rather than deleted because it works and its templates are written;
  the only missing piece is a domain. Enabling it is one environment variable. It stays off because a
  sign-in option that cannot deliver its own credential is worse than not offering it.
- The risk in keeping dormant code is that it rots unexercised. Accepted knowingly: it is small,
  isolated in one component, and documented here and in the templates README.

### Known limitation: the consent screen says supabase.co

Google's consent screen reads "Continue to `<project-ref>.supabase.co`" rather than "Continue to
beFORE", and shows no logo. This is not a misconfiguration, and it is worth writing down so nobody
spends an afternoon trying to fix it in the Google console.

Google names the host that owns the OAuth callback, and that host really is Supabase, because the
authorised redirect URI must point at `https://<project-ref>.supabase.co/auth/v1/callback`. It is a
long-standing Supabase issue (supabase/supabase#33387).

What is available for free: setting the **App name** to beFORE in the Google consent screen improves
the lines that render the app name. The domain line does not change.

What would actually fix it: a **Supabase custom domain**, which is a paid add-on *and* requires a paid
plan, so roughly 35 USD a month. That is far outside this project's free-tier constraint, and out of
proportion to the benefit. A logo is blocked by the same root cause: Google's brand verification
requires proving ownership of the authorised domain, and we do not own `supabase.co`.

Accepted as-is. The flow works and is safe; it just looks less polished than a funded product at the
one moment the user is on Google's page. Revisit only if the project ever moves to a paid Supabase
plan with its own domain.
