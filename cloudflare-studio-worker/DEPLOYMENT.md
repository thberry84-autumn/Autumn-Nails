# Studio deployment checklist

Do not perform these steps during the build phase. They are the controlled deployment sequence.

## 1. Cloudflare Access

Create a Self-hosted application for the exact public hostname:

`studio.autumnnails.com`

Use an Allow policy containing only the owner's approved email address.

Enable One-Time PIN as the login method. Do not use `Login Methods: One-time PIN` as an Include rule by itself; the email restriction must remain in the Allow policy.

Enable Independent MFA at the organization level, then set the Studio application/policy to require the Authenticator application (TOTP). Prefer `Require every login` for this private admin application.

## 2. DNS / Worker

Attach `studio.autumnnails.com` to the `autumn-nails-studio` Worker as a Custom Domain. Do not expose a `workers.dev` URL for production use.

The current Wrangler configuration deliberately has `workers_dev: false` so the build cannot accidentally create a public `workers.dev` endpoint.

## 3. API migration

Before production cutover, migrate the browser API calls from the existing password-session model to a Studio-only authenticated boundary. The Studio Worker must never accept an unauthenticated admin request and must not expose the existing admin API credentials to browser JavaScript.

The existing public booking endpoints must remain public where required by the customer booking flow; only administrative operations should require the Studio authentication boundary.

## 4. Cutover

1. Deploy Studio without changing the public site.
2. Confirm Access login works: email -> six-digit OTP -> TOTP.
3. Confirm every admin module works with real data.
4. Confirm unauthenticated requests are denied.
5. Confirm `studio.autumnnails.com` is not linked from the public site or sitemap.
6. Confirm the public `/admin/` area is no longer the active administration entry point.
7. Remove the old password login only after Studio has passed the full test checklist.

## 5. Rollback

Keep the existing `/admin/` implementation intact until the Studio cutover has been tested and accepted. If anything fails, revert the Studio deployment and continue using the existing admin area while the issue is corrected.
