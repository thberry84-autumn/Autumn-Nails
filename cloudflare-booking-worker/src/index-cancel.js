import productionWorker, { isPastLondonSlot } from "./index-production.js";

const SITE_ORIGINS = new Set(["https://autumnnails.com", "https://www.autumnnails.com"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const originHeader = request.headers.get("Origin");
    const origin = SITE_ORIGINS.has(originHeader) ? originHeader : "https://autumnnails.com";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method === "POST" && url.pathname === "/api/cancel") return cancelBooking(request, env, origin);
    return productionWorker.fetch(request, env, ctx);
  }
};

async function cancelBooking(request, env, origin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Please try again." }, 400, origin); }

  const email = normaliseEmail(body.email);
  const phone = normalisePhone(body.phone);
  const date = cleanDate(body.date);
  const startTime = cleanTime(body.startTime);
  const bookingId = String(body.bookingId || "").trim();

  if (!email || !phone || !date || !startTime) {
    return json({ error: "Please enter your email, mobile number and appointment date and time." }, 400, origin);
  }
  if (bookingId && !/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return json({ error: "Please check your booking reference." }, 400, origin);
  }

  let bookings;
  if (bookingId) {
    const booking = await env.DB.prepare(
      "SELECT b.id,b.date,b.start_time,b.status,c.email,c.phone,c.first_name FROM bookings b JOIN clients c ON c.id=b.client_id WHERE b.id=? AND b.date=? AND b.start_time=? LIMIT 1"
    ).bind(bookingId, date, startTime).first();
    bookings = booking ? [booking] : [];
  } else {
    const result = await env.DB.prepare(
      "SELECT b.id,b.date,b.start_time,b.status,c.email,c.phone,c.first_name FROM bookings b JOIN clients c ON c.id=b.client_id WHERE c.email=? AND b.date=? AND b.start_time=? ORDER BY b.created_at DESC"
    ).bind(email, date, startTime).all();
    bookings = result.results || [];
  }

  const booking = bookings.find(item => normaliseEmail(item.email) === email && normalisePhone(item.phone) === phone);

  // Use the same response for 'not found' and 'wrong details' so the endpoint
  // cannot be used to discover whether a particular appointment exists.
  if (!booking) {
    return json({ error: "We couldn't verify that appointment. Please check your details and try again." }, 403, origin);
  }
  if (booking.status !== "confirmed") {
    return json({ error: booking.status === "cancelled" ? "This appointment has already been cancelled." : "This appointment can no longer be cancelled online." }, 409, origin);
  }
  if (isPastLondonSlot(booking.date, booking.start_time)) {
    return json({ error: "This appointment has already started or passed and can no longer be cancelled online." }, 409, origin);
  }

  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE bookings SET status='cancelled',updated_at=? WHERE id=? AND status='confirmed'").bind(now, booking.id),
    env.DB.prepare("UPDATE availability_slots SET status='available',updated_at=? WHERE id=(SELECT slot_id FROM bookings WHERE id=? LIMIT 1)").bind(now, booking.id),
    env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), booking.id, "cancelled", JSON.stringify({ source: "customer" }), now)
  ]);

  if (!results[0]?.meta?.changes) return json({ error: "This appointment has just changed. Please refresh and try again." }, 409, origin);

  return json({ ok: true, booking: { id: booking.id, date: booking.date, startTime: booking.start_time, firstName: booking.first_name } }, 200, origin);
}

function normaliseEmail(value) { return String(value || "").trim().toLowerCase().slice(0, 254); }
function normalisePhone(value) {
  const raw = String(value || "").trim().replace(/[^0-9+]/g, "");
  if (raw.startsWith("00")) return "+" + raw.slice(2);
  if (raw.startsWith("07")) return "+44" + raw.slice(1);
  return raw.slice(0, 30);
}
function cleanDate(value) { const text = String(value || ""); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""; }
function cleanTime(value) { const text = String(value || ""); return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : ""; }
function corsHeaders(origin) { return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }; }
function json(data, status, origin) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
