# Autumn Nails online booking data

## Purpose

This document records the data-minimisation and retention approach for the Autumn Nails online booking system. It is an internal implementation note and is not the public privacy notice.

## Data used by online booking

The booking system needs customer name, email address and phone number to administer an appointment. It also keeps booking records and booking status so the salon can manage appointments and recognise returning customers.

Marketing consent is stored separately as a boolean and must only be used for the stated marketing purpose.

The online booking system does not collect the detailed medical/treatment consultation information held on the salon's paper consultation form.

## Returning-client / infill rule

Booking history is required to determine whether a client qualifies for an infill price. Only completed qualifying appointments are used for this calculation. A qualifying appointment must be within 21 days of the new appointment. Cancelled appointments do not qualify.

## Calendar feed

The calendar feed is intentionally minimised. It must not expose a customer's surname or other unnecessary personal information. Calendar access is protected by a secret token and the token can be rotated by an authenticated administrator.

## Retention

No automatic deletion period is implemented by this document. A retention period should be agreed by the business and reflected in the public privacy notice before automatic deletion is introduced. The system must not delete booking history while it is still required for legitimate appointment administration, accounting/legal obligations, dispute handling, or the returning-client pricing rule.

## Paper consultation records

The paper consultation/treatment record remains separate from the online booking database. Any retention period for paper consultation records should be set consistently with the salon's professional, insurance and legal obligations and documented in the salon's privacy information.

## Data subject requests

The salon should have a practical process for responding to access, correction, deletion and marketing-preference requests. Requests should be assessed against any applicable legal or contractual reason the business must retain particular records.

## Next implementation gate

Before production launch, review this note alongside the public privacy notice and confirm:

1. the final retention periods for online booking records and paper consultation records;
2. the lawful basis for booking administration and marketing;
3. how clients can exercise their data-protection rights;
4. how backups are retained and securely deleted;
5. who has access to the booking database and calendar feed.
