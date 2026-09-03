export async function handleBookingStatusUpdate(request, env, ctx, origin, pathname) {
  if (request.method !== "PATCH" || !pathname.startsWith("/api/bookings/")) return null;
  if (!ctx?.access) return json({ error: "Studio authentication is required." }, 401, origin);
  const identity = await ctx.access.getIdentity();
  if (!identity?.email) return json({ error: "Studio identity could not be verified." }, 403, origin);

  const id = String(pathname.split("/").pop());
  const body = await request.json();
  if (!validId(id)) return json({ error: "Invalid booking." }, 400, origin);

  const current = await env.DB.prepare("SELECT * FROM bookings WHERE id=? LIMIT 1").bind(id).first();
  if (!current) return json({ error: "Booking not found." }, 404, origin);

  const allowedStatus = new Set(["confirmed", "completed", "cancelled"]);
  const allowedPayment = new Set(["unpaid", "paid", "refunded", "not-required"]);
  const status = body.status == null ? current.status : String(body.status);
  const payment = body.paymentStatus == null ? current.payment_status : String(body.paymentStatus);
  if (!allowedStatus.has(status)) return json({ error: "Invalid booking status." }, 400, origin);
  if (!allowedPayment.has(payment)) return json({ error: "Invalid payment status." }, 400, origin);

  const adjustment = body.priceAdjustmentPence == null
    ? Number(current.price_adjustment_pence || 0)
    : Math.round(Number(body.priceAdjustmentPence));
  if (!Number.isFinite(adjustment) || adjustment < -100000 || adjustment > 100000) {
    return json({ error: "Invalid price adjustment." }, 400, origin);
  }

  const finalPrice = Math.max(0, Number(current.price_pence || 0) + adjustment);
  const now = new Date().toISOString();
  const metadata = JSON.stringify({ status, paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice });

  try {
    if (status === "cancelled" && current.status !== "cancelled") {
      const slotUpdate = await env.DB.prepare(
        "UPDATE availability_slots SET status='available',updated_at=? WHERE id=? AND status='booked'"
      ).bind(now, current.slot_id).run();
      if (!slotUpdate.meta?.changes) {
        return json({ error: "The appointment space is not currently booked, so the booking could not be cancelled safely." }, 409, origin);
      }
    } else if (current.status === "cancelled" && status !== "cancelled") {
      const slotUpdate = await env.DB.prepare(
        "UPDATE availability_slots SET status='booked',updated_at=? WHERE id=? AND status='available'"
      ).bind(now, current.slot_id).run();
      if (!slotUpdate.meta?.changes) {
        return json({ error: "That appointment space is no longer available." }, 409, origin);
      }
    }

    await env.DB.batch([
      env.DB.prepare("UPDATE bookings SET status=?,payment_status=?,price_adjustment_pence=?,final_price_pence=?,updated_at=? WHERE id=?")
        .bind(status, payment, adjustment, finalPrice, now, id),
      env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID(), id, "studio_booking_updated", metadata, now)
    ]);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) {
      return json({ error: "That appointment space is no longer available." }, 409, origin);
    }
    throw error;
  }

  return json({ ok: true }, 200, origin);
}

function validId(value) { return /^[0-9a-f-]{36}$/i.test(String(value)); }
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}