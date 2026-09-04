# Autumn Nails Studio API

This is the isolated admin API for `Studio.AutumnNails.com`.

## Architecture

- `autumn-nails-studio` serves the private Studio UI.
- `autumn-nails-studio-api` serves authenticated booking/client endpoints and shares the existing `autumn-nails-booking` D1 database.
- The API also shares the existing `autumn-nails-images` R2 bucket and the existing GitHub captions file.
- No public booking endpoint is changed by this build.
- The API requires a Cloudflare Access-authenticated Worker request (`ctx.access`). There is no admin password, bearer session token, or credential in the Studio frontend.

## Intended Access setup

Use one Cloudflare Access self-hosted application for these concrete hostnames so the browser can authenticate once and use the same session across the UI and API:

- `studio.autumnnails.com`
- `studio-booking-api.autumnnails.com`
- `studio-media-api.autumnnails.com`

The Access application should have an Allow policy restricted to the intended Autumn Nails admin email address.

Authentication should be configured as:

1. One-time PIN email identity provider.
2. Independent MFA enabled at organisation level.
3. Authenticator application (TOTP) allowed for the Studio application/policy.
4. Require MFA on every login for the Studio application/policy.
5. No public Allow policy and no domain-wide wildcard access.

Cloudflare Access is the security boundary. The Worker code also requires `ctx.access`, so an accidental direct/origin request without Access authentication is rejected.

## Secrets / bindings

`GITHUB_TOKEN` is required at deploy time for gallery caption/order updates. It must be stored as a Cloudflare Worker secret, never committed to Git.

The D1 and R2 bindings in `wrangler.jsonc` point at the existing production data stores. **Do not run migrations from this project.** The Studio API is intended to use the existing schema only.

## Deployment order

1. Deploy the Studio API Worker only after its Access hostname/policy has been prepared.
2. Add `studio-booking-api.autumnnails.com` and `studio-media-api.autumnnails.com` to the same Access application as `studio.autumnnails.com`.
3. Set `GITHUB_TOKEN` on the Studio API Worker.
4. Test unauthenticated requests: they must receive `401`/Access block.
5. Test the full email OTP -> TOTP -> Studio flow.
6. Test bookings, clients, marketing, finance and gallery actions against the real D1/R2 data.
7. Only after those tests pass should the old `/admin/` interface be retired.

Nothing in this project automatically deploys these Workers, changes DNS, changes Access, or subscribes to a paid service.
