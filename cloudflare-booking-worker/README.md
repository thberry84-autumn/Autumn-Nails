# Autumn Nails booking system

Self-owned booking infrastructure for Autumn Nails.

## v1 scope

- Cloudflare Worker API
- Cloudflare D1 database
- Released-slot availability model
- No appointments are seeded initially
- Returning customers are recognised by email when they book again
- Online customer data is limited to booking administration
- Paper consultation forms remain separate
- Current Autumn Nails service/pricing catalogue
- 3-week infill rule:
  - Builder Infill £25 → Builder Full Set £28 after 21 days / without a qualifying previous appointment
  - Builder & Gel Polish Infill £27 → Builder & Gel Polish Full Set £30 after 21 days / without a qualifying previous appointment
- Nail art and stamping are stored as add-ons
- No service timings are stored yet
- Individual `.ics` appointment export
- Private iCalendar subscription feed for the owner
- Private admin panel for releasing/removing availability and managing bookings

## Files

- `src/index.js` — API and booking rules
- `migrations/0001_booking_system.sql` — D1 schema
- `wrangler.jsonc` — Worker/D1 configuration template
- `../booking.html` — public booking journey
- `../admin/booking.html` — private booking administration
- `../privacy.html` — booking privacy notice draft

## Cloudflare setup

The repository does not contain Cloudflare credentials or database IDs.

1. Create the D1 database:

   `npx wrangler d1 create autumn-nails-booking --location weur`

2. Put the returned database ID into `wrangler.jsonc`.

3. Apply the migration remotely:

   `npx wrangler d1 migrations apply autumn-nails-booking --remote`

4. Set the Worker secrets in Cloudflare/Wrangler. Never commit their values to GitHub:

   `npx wrangler secret put ADMIN_EMAIL`

   `npx wrangler secret put ADMIN_PASSWORD`

   `npx wrangler secret put SESSION_SECRET`

5. Deploy from this directory:

   `npx wrangler deploy`

6. Set `BOOKING_PUBLIC_URL` to the deployed Worker URL and redeploy if the URL differs from the template.

7. Add a custom Cloudflare route/domain when ready. The public site currently uses `autumnnails.com`.

8. Before production, verify in the Cloudflare dashboard that the production Worker has all three required secrets configured and that no secret values are present in repository files, build logs or deployment configuration.

9. Before production, verify D1 backup/recovery settings and complete a controlled restore test. Record the result without copying customer data into GitHub or other development systems.

## Privacy boundary

The booking database intentionally does not contain the Autumn Nails paper consultation form or health/medical information. Those records remain separate.

Marketing opt-in is stored separately from the information required to administer a booking.

The privacy notice is a working draft and should be reviewed before the booking system goes live, particularly the retention schedule, final lawful-basis wording, contact details and actual third-party processors.

## Availability model

Nothing is bookable until a slot is released through the private admin panel.

A slot contains:

- date
- start time
- optional list of services allowed at that time
- status

Service duration is intentionally not stored in v1.

## iCalendar

The admin panel can generate a private `.ics` subscription URL. Apple supports subscribing to an iCal calendar by URL on iPhone/iPad.

The feed contains only appointment date/time, customer first name and booked service. It does not contain consultation or health information.

## Future phases

Designed to allow later addition of service timings, email confirmations/reminders, deposits/payments, digital consultation records, richer client history and conversational availability management.
