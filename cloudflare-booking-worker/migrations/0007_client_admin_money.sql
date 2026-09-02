-- Admin/client snagging: retain original booked price while allowing a final charge and payment status.
ALTER TABLE bookings ADD COLUMN price_adjustment_pence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN final_price_pence INTEGER;
ALTER TABLE bookings ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','not-required'));
UPDATE bookings SET final_price_pence = price_pence WHERE final_price_pence IS NULL;
