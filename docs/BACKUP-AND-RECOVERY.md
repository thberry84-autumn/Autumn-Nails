# Autumn Nails backup and recovery plan

## Scope

This is the operational backup/recovery checklist for the booking system. It does not contain database credentials or backup copies of customer data.

## Production requirements

1. Confirm that the production D1 database has an appropriate backup/recovery mechanism enabled in Cloudflare.
2. Confirm that backups/snapshots are protected by the same access controls as production data.
3. Confirm that backup retention is documented and does not exceed the agreed business/legal requirement.
4. Confirm that a restore can be performed without exposing customer data publicly.
5. Test a restore before production launch and record the result.
6. Keep application source code and database schema/migrations in GitHub so the application can be rebuilt independently of a database backup.

## Recovery priority

The booking database is operationally important, but the salon should retain a practical paper record of appointments/consultation information as appropriate. Recovery should prioritise restoring appointment administration while preserving the integrity and confidentiality of customer information.

## Incident response

If customer data is accidentally exposed, deleted or accessed without authorisation:

- stop further exposure where possible;
- preserve relevant evidence and logs;
- assess what personal data was affected and whose data may be involved;
- rotate exposed secrets, including the calendar token, where applicable;
- follow the salon's UK GDPR personal-data-breach assessment and notification process;
- document the incident and corrective action.

## Launch gate

Do not mark backup/recovery complete until the actual production Cloudflare configuration has been checked and a restore test has been successfully completed.
