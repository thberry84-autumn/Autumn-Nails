# Autumn Nails launch data controls

## Current controls

- Collect only booking information needed to administer appointments.
- Keep detailed consultation and treatment information on the separate consultation record rather than duplicating it in the online booking database.
- Store marketing preference separately from booking details.
- Use completed appointment history for the returning-client/infill rule; cancelled appointments do not qualify.
- Minimise calendar event information and do not expose the client's surname.
- Restrict calendar access with the calendar secret and support token rotation.
- Keep administrator credentials and signing secrets out of source control.

## Production checklist

Before launch, confirm the public privacy notice contains the final contact details, lawful bases, retention periods and actual third-party processors used by the live system.

Confirm that production backups are protected, access is limited to authorised people, and deletion/retention processes cover both live data and backups.

Do not enable automatic deletion until the final retention schedule has been agreed. When agreed, implement and test it as a separate change with explicit coverage for completed, cancelled and future bookings and for the returning-client pricing requirement.

## Operational rule

If a client asks for access, correction or deletion of their online booking information, handle the request through the salon's documented data-protection process. Do not delete records that the business is required to retain for legal, accounting, insurance, dispute or other applicable obligations without first assessing the request.
