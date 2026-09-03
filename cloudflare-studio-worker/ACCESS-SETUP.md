# Studio Access setup (when ready to deploy)

This document is a deployment checklist only. Nothing here changes Cloudflare by itself.

## 1. Deploy the three isolated Workers

- `autumn-nails-studio` — private Studio UI
- `autumn-nails-studio-api` — authenticated booking/client API
- `autumn-nails-upload` remains the existing production media Worker; the new Studio API uses the same R2 bucket instead of changing that Worker.

The Studio API and UI are already isolated on `studio-admin-build`.

## 2. Give the new Workers their custom hostnames

Use:

- `studio.autumnnails.com`
- `studio-booking-api.autumnnails.com`

The gallery API currently runs through the separate media API hostname in the Studio frontend. Before deployment, either expose the Studio API's gallery routes on the same API hostname or create the corresponding Access-protected media Worker hostname. Do not expose gallery write routes without Access.

## 3. Create one Access self-hosted application

Use one Access application containing the Studio and its API hostnames. A multi-domain Access application lets the browser authenticate once and receive application cookies for the other concrete hostnames.

Recommended domains:

- `studio.autumnnails.com`
- `studio-booking-api.autumnnails.com`
- `studio-media-api.autumnnails.com` (only when the media API is deployed)

Create an Allow policy for the single intended admin email address. Do not use an email-domain-wide Allow rule unless that is deliberately wanted.

## 4. Configure the login method

Enable the One-time PIN identity provider for the Access application.

The intended sign-in experience is:

1. Enter the approved email address.
2. Cloudflare emails a six-digit one-time PIN.
3. After the identity step, Cloudflare prompts for the enrolled authenticator application code.
4. A valid TOTP code opens Studio.

Independent MFA must be enabled for the organisation first, then enabled for the Studio application/policy with Authenticator application (TOTP) allowed.

For the strongest version of the requested flow, configure MFA so it is required on every login rather than relying on a long-lived MFA session.

## 5. Enrol the authenticator

The first successful Access sign-in can be used to enrol an authenticator application through the Cloudflare App Launcher / MFA devices area. Scan the QR code with the authenticator app on the separate device used for MFA, then enter the six-digit code to confirm enrolment.

Do not put the TOTP setup key, QR secret, recovery codes, Access credentials or Cloudflare API tokens in this repository.

## 6. Test before switching anything over

Test all of these before touching the existing `/admin/` system:

- wrong email is blocked
- correct email receives the one-time PIN
- expired/used PIN cannot be reused
- missing TOTP is blocked
- wrong TOTP is blocked
- correct TOTP opens Studio
- direct unauthenticated API request is rejected
- bookings load and can be updated
- availability can be released/removed
- clients can be viewed/created/edited
- marketing list only contains opted-in customers
- payment status and price adjustments work
- photos can be uploaded/deleted/captioned
- public website booking still works
- public website gallery still works

Only after the above passes should the old password login be removed.

## Cost boundary

This build deliberately uses Cloudflare Workers, D1, R2 and Access features without adding a paid third-party authentication service. No subscription is created by these files. Actual Cloudflare dashboard deployment/configuration remains a separate final step.
