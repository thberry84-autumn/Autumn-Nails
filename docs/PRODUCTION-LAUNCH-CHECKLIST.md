# Autumn Nails — Production Launch Checklist

This checklist is the final gate for the booking system. Do not treat the site as fully launch-ready until every required item is verified.

## Code and tests

- [x] Production Worker entrypoint is the Wrangler `main` entrypoint.
- [x] Expired same-day slots are hidden from public availability.
- [x] Direct booking requests for expired slots are rejected.
- [x] Admin login has brute-force protection.
- [x] Admin sessions are signed and expire.
- [x] Security headers are applied to API responses.
- [x] Sensitive/admin responses use `no-store` where required.
- [x] Worker regression tests include the production entrypoint.
- [ ] GitHub Actions test run passes on the final branch head.

## Cloudflare production configuration

- [ ] Confirm the production Worker is deployed from the intended branch/revision.
- [ ] Confirm the D1 binding points to the intended production database.
- [ ] Confirm `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `SESSION_SECRET` are configured as Worker secrets.
- [ ] Confirm booking email configuration is present and tested.
- [ ] Confirm the public booking URL is correct.
- [ ] Confirm no secret values appear in repository files or CI logs.

## Database recovery

- [ ] Confirm the applicable Cloudflare D1 recovery/backup capability and retention for the production plan.
- [ ] Document the recovery procedure separately from customer data.
- [ ] Perform a controlled restore/recovery test before launch.
- [ ] Record the test result and date without copying live customer records into GitHub.

## Privacy and data handling

- [ ] Review the final privacy notice against the actual production configuration.
- [ ] Confirm the retention/deletion policy is operationally achievable.
- [ ] Confirm consultation/health information remains outside the booking database.
- [ ] Confirm marketing consent is only used for marketing where the client has actively opted in.
- [ ] Confirm the public site does not expose the full physical/home address.

## End-to-end test

Use a controlled test booking and verify the complete journey:

1. Select a real released test slot.
2. Complete the public booking form.
3. Confirm the booking is created exactly once.
4. Confirm the slot becomes unavailable.
5. Confirm the confirmation response contains the expected appointment details.
6. Confirm the client email is delivered if email is enabled.
7. Confirm the business notification is delivered if enabled.
8. Confirm the calendar event works.
9. Confirm the admin panel can see and manage the booking.
10. Cancel/delete the test data as appropriate before launch.

## Go / no-go rule

**Go** only when the outstanding checkboxes above have been verified against production.

Until then, keep the Phase 5 pull request in draft and do not merge it into `main`.
