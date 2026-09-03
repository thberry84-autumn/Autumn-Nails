# Studio deployment checklist

Do not perform these steps during the build phase. They are the controlled deployment sequence.

## 1. Cloudflare Access

Create one Self-hosted Access application covering these exact hostnames:

- `studio.autumnnails.com`
- `studio-booking-api.autumnnails.com`
- `studio-media-api.autumnnails.com`

Use an Allow policy containing only the owner's approved email address.

Enable One-Time PIN as the identity provider. Keep the email restriction in the Allow policy.

Enable Independent MFA at the organisation level, then require Authenticator application (TOTP) for the Studio application/policy. Prefer `Require every login` for this private admin application.

A multi-domain Access application is intentional here so the browser can authenticate once and use the same Access session for the UI and API hosts.

## 2. Workers / DNS

Attach `studio.autumnnails.com` to the `autumn-nails-studio` Worker as a Custom Domain.

Attach both API hostnames above to the `autumn-nails-studio-api` Worker as Custom Domains.

The current Wrangler configurations deliberately have `workers_dev: false`, so these Workers do not need public `workers.dev` production endpoints.

## 3. API security

The Studio API requires `ctx.access` for every request. This means the API itself rejects requests that reach it without an Access-authenticated Worker context; browser JavaScript never receives an admin password or legacy bearer token.

The API uses the existing booking D1 database and nail-image R2 bucket. It does not run migrations. Set the existing GitHub token as the `GITHUB_TOKEN` Worker secret before enabling gallery write operations.

The API Worker is intentionally separate from the public booking Worker, so the customer booking flow can remain unchanged during migration.

## 4. Cutover

1. Deploy the Studio UI and Studio API from the isolated branch.
2. Configure the three hostnames in the single Access application.
3. Confirm the login works: email -> six-digit OTP -> TOTP.
4. Confirm every admin module works with real data.
5. Confirm unauthenticated API requests are denied.
6. Confirm `studio.autumnnails.com` is not linked from the public site or sitemap.
7. Confirm public booking and public gallery still work.
8. Only then retire the old `/admin/` password login.

## 5. Rollback

Keep the existing `/admin/` implementation intact until Studio has passed the full test checklist. If anything fails, leave production on the existing admin area while the Studio branch is corrected.
