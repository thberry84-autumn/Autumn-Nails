# Autumn Nails Studio

Private administration application for `studio.autumnnails.com`.

## Important deployment rule

This project is intentionally isolated from the production website. Do not deploy it, add a DNS record, create a Cloudflare Access application, or change the live `/admin/` area until the migration has been reviewed and the end-to-end authentication flow has been tested.

## Target architecture

- Public website: `https://autumnnails.com`
- Private Studio: `https://studio.autumnnails.com`
- Private API hosts: `studio-booking-api.autumnnails.com` and `studio-media-api.autumnnails.com`
- Studio authentication: Cloudflare Access
  - approved email via One-Time PIN
  - independent TOTP authenticator MFA
  - MFA required for every Studio login
- Studio application: Cloudflare Worker + Static Assets
- Existing booking database/API remains the data layer during migration.

## Migration sequence

1. Build the Studio shell and security headers on this branch.
2. Migrate the existing admin modules into the Studio asset set without changing production.
3. Add a Studio-only API boundary so browser requests use the Cloudflare Access identity rather than the current password session.
4. Test bookings, clients, photos, marketing and payments against the existing data layer.
5. Configure `studio.autumnnails.com` and the Cloudflare Access application only when ready for a controlled deployment.
6. Test the complete flow: email -> six-digit OTP -> authenticator TOTP -> Studio dashboard.
7. Only after successful testing, retire the public `/admin/` login and remove its production references.

## Audit status

The code has been reviewed at PR level for authentication boundaries, existing D1 schema compatibility, booking-slot uniqueness, service pricing consistency, input validation, gallery file restrictions, client/marketing/finance data access, and production isolation. Manual/completed treatment entry also uses the existing booking schema and event history model. The remaining validation is runtime testing after a controlled Cloudflare deployment; this branch intentionally does not deploy automatically.

## SEO / discovery

The Studio is deliberately absent from public navigation and sitemap planning. The asset set also contains `robots.txt`, `noindex` metadata and an `X-Robots-Tag: noindex` header. These are defence-in-depth measures; the real access control is Cloudflare Access.

## Cost constraint

This project must remain compatible with Cloudflare's Workers Free plan. Do not add paid services, paid dependencies, subscriptions, or external hosted admin platforms.
