export async function handlePaymentAmend(request, env, ctx, origin, pathname) {
  if (request.method !== "PATCH" || !pathname.startsWith("/api/bookings/") || !pathname.endsWith("/payment")) return null;
  if (!ctx?.access) return json({ error: "Studio authentication is required." }, 401, origin);
  const identity = await ctx.access.getIdentity();
  if (!identity?.email) return json({ error: "Studio identity could not be verified." }, 403, origin);
  const id = String(pathname.split("/")[3] || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid booking." }, 400, origin);
  const body = await request.json();
  const current = await env.DB.prepare("SELECT id,price_pence,price_adjustment_pence,payment_status FROM bookings WHERE id=? LIMIT 1").bind(id).first();
  if (!current) return json({ error: "Booking not found." }, 404, origin);
  const allowed = new Set(["unpaid", "paid", "refunded", "not-required"]);
  const payment = body.paymentStatus == null ? String(current.payment_status || "unpaid") : String(body.paymentStatus);
  if (!allowed.has(payment)) return json({ error: "Invalid payment status." }, 400, origin);
  const adjustment = body.priceAdjustmentPence == null ? Number(current.price_adjustment_pence || 0) : Math.round(Number(body.priceAdjustmentPence));
  if (!Number.isFinite(adjustment) || adjustment < -100000 || adjustment > 100000) return json({ error: "Invalid price adjustment." }, 400, origin);
  const finalPrice = Math.max(0, Number(current.price_pence || 0) + adjustment);
  const now = new Date().toISOString();
  const metadata = JSON.stringify({ paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice });
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE bookings SET payment_status=?,price_adjustment_pence=?,final_price_pence=?,updated_at=? WHERE id=?").bind(payment, adjustment, finalPrice, now, id),
      env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, "studio_payment_amended", metadata, now)
    ]);
  } catch (error) {
    console.error("Payment amendment failed", error);
    return json({ error: "Could not save the payment amendment. Please try again." }, 500, origin);
  }
  return json({ ok: true, paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice }, 200, origin);
}
function json(data, status, origin) { return new Response(JSON.stringify(data), { status, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS", "Vary": "Origin", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
