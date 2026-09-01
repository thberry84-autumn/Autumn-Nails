const SITE_ORIGINS = new Set(["https://autumnnails.com", "https://www.autumnnails.com"]);
const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;

export default {
  async fetch(request, env) {
    const originHeader = request.headers.get("Origin");
    const origin = SITE_ORIGINS.has(originHeader) ? originHeader : "https://autumnnails.com";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "autumn-nails-booking" }, 200, origin);
      if (url.pathname === "/api/services" && request.method === "GET") return publicServices(origin);
      if (url.pathname === "/api/availability" && request.method === "GET") return await publicAvailability(url, env, origin);
      if (url.pathname === "/api/book" && request.method === "POST") return await createBooking(request, env, origin);
      if (url.pathname === "/api/login" && request.method === "POST") return await adminLogin(request, env, origin);
      if (url.pathname === "/api/session" && request.method === "GET") return json({ authenticated: Boolean(await readSession(request, env)) }, 200, origin);
      if (url.pathname === "/api/admin/availability" && request.method === "GET") return requireAdmin(request, env, origin, () => adminAvailability(env, origin));
      if (url.pathname === "/api/admin/availability" && request.method === "POST") return requireAdmin(request, env, origin, () => addAvailability(request, env, origin));
      if (url.pathname.startsWith("/api/admin/availability/") && request.method === "DELETE") return requireAdmin(request, env, origin, () => deleteAvailability(Number(url.pathname.split("/").pop()), env, origin));
      if (url.pathname === "/api/admin/bookings" && request.method === "GET") return requireAdmin(request, env, origin, () => adminBookings(env, origin));
      if (url.pathname.startsWith("/api/admin/bookings/") && request.method === "PATCH") return requireAdmin(request, env, origin, () => updateBookingStatus(Number(url.pathname.split("/").pop()), request, env, origin));
      if (url.pathname === "/api/admin/calendar-token" && request.method === "GET") return requireAdmin(request, env, origin, () => calendarToken(env, origin));
      if (url.pathname.startsWith("/calendar/") && request.method === "GET") return calendarFeed(decodeURIComponent(url.pathname.slice("/calendar/".length)), env);
      return json({ error: "Not found" }, 404, origin);
    } catch (error) {
      console.error(error);
      return json({ error: "Something went wrong. Please try again." }, 500, origin);
    }
  }
};

const SERVICES = [
  { id: "basic-manicure", name: "Basic Manicure", price: 1500, bookable: true },
  { id: "gel-polish", name: "Gel Polish", price: 2200, bookable: true },
  { id: "builder-full-set", name: "Builder Full Set", price: 2800, bookable: true },
  { id: "builder-infill", name: "Builder Infill", price: 2500, bookable: true, infillDays: 21, fallbackId: "builder-full-set" },
  { id: "builder-gel-full-set", name: "Builder & Gel Polish Full Set", price: 3000, bookable: true },
  { id: "builder-gel-infill", name: "Builder & Gel Polish Infill", price: 2700, bookable: true, infillDays: 21, fallbackId: "builder-gel-full-set" },
  { id: "acrylic-full-set", name: "Acrylic – Full Set", price: 3500, bookable: true },
  { id: "express-gel-toes", name: "Express Gel Toes", price: 2200, bookable: true },
  { id: "nail-art", name: "Nail Art (per nail)", price: 100, bookable: false, addon: true },
  { id: "nail-stamping", name: "Nail Stamping (per nail)", price: 100, bookable: false, addon: true },
  { id: "nail-stamping-full-set", name: "Nail Stamping (full set, per colour)", price: 600, bookable: false, addon: true }
];
const QUALIFYING_SERVICES = { "builder-infill": "builder-full-set", "builder-gel-infill": "builder-gel-full-set" };

function corsHeaders(origin) { return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }; }
function json(data, status, origin, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", ...extra } }); }
function publicServices(origin) { return json({ services: SERVICES.filter(s => s.bookable), addons: SERVICES.filter(s => s.addon) }, 200, origin, { "Cache-Control": "public, max-age=300" }); }

function londonDateTime() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function publicAvailability(url, env, origin) {
  const serviceId = url.searchParams.get("service");
  if (!SERVICES.some(s => s.id === serviceId && s.bookable)) return json({ error: "Please choose a valid service." }, 400, origin);
  const result = await env.DB.prepare("SELECT id, date, start_time, service_ids_json FROM availability_slots WHERE status = 'available' AND date >= date('now', 'localtime') ORDER BY date, start_time").all();
  const now = londonDateTime();
  const slots = (result.results || []).filter(row => {
    if (row.date === now.date && row.start_time <= now.time) return false;
    const ids = parseJson(row.service_ids_json, []);
    return !ids.length || ids.includes(serviceId);
  });
  return json({ slots }, 200, origin, { "Cache-Control": "no-store" });
}

async function createBooking(request, env, origin) {
  const body = await request.json();
  const slotId = Number(body.slotId), serviceId = String(body.serviceId || "");
  const firstName = cleanText(body.firstName, 80), surname = cleanText(body.surname, 80), email = normaliseEmail(body.email), phone = cleanText(body.phone, 40);
  const marketingOptIn = body.marketingOptIn === true;
  if (!Number.isInteger(slotId) || !serviceId || !firstName || !surname || !email || !phone) return json({ error: "Please complete all required details." }, 400, origin);
  const service = SERVICES.find(s => s.id === serviceId && s.bookable);
  if (!service) return json({ error: "Please choose a valid service." }, 400, origin);
  const slot = await env.DB.prepare("SELECT id, date, start_time, status, service_ids_json FROM availability_slots WHERE id = ?").bind(slotId).first();
  if (!slot || slot.status !== "available") return json({ error: "That appointment is no longer available. Please choose another slot." }, 409, origin);
  const allowed = parseJson(slot.service_ids_json, []);
  if (allowed.length && !allowed.includes(serviceId)) return json({ error: "That service is not available at the selected time." }, 409, origin);
  const nowLondon = londonDateTime();
  if (slot.date < nowLondon.date || (slot.date === nowLondon.date && slot.start_time <= nowLondon.time)) return json({ error: "That appointment time has passed. Please choose another slot." }, 409, origin);

  const existingClient = await env.DB.prepare("SELECT id FROM clients WHERE email = ? LIMIT 1").bind(email).first();
  let effectiveService = service, infillChanged = false, qualifyingDate = null;
  if (QUALIFYING_SERVICES[serviceId]) {
    const qualifying = existingClient ? await env.DB.prepare("SELECT date FROM bookings WHERE client_id = ? AND service_id = ? AND status = 'completed' ORDER BY date DESC, start_time DESC LIMIT 1").bind(existingClient.id, QUALIFYING_SERVICES[serviceId]).first() : null;
    qualifyingDate = qualifying?.date || null;
    if (!qualifyingDate || daysBetween(qualifyingDate, slot.date) > service.infillDays || daysBetween(qualifyingDate, slot.date) < 0) {
      effectiveService = SERVICES.find(s => s.id === service.fallbackId); infillChanged = true;
    }
  }

  const addons = normaliseAddons(body.addons);
  const addonTotal = SERVICES.filter(s => s.addon).reduce((sum, s) => sum + s.price * Number(addons[s.id] || 0), 0);
  const totalPrice = effectiveService.price + addonTotal;
  const clientId = existingClient?.id || crypto.randomUUID(), bookingId = crypto.randomUUID(), now = new Date().toISOString();
  const statements = [];
  if (existingClient) statements.push(env.DB.prepare("UPDATE clients SET first_name = ?, surname = ?, phone = ?, marketing_opt_in = ?, updated_at = ? WHERE id = ?").bind(firstName, surname, phone, marketingOptIn ? 1 : 0, now, clientId));
  else statements.push(env.DB.prepare("INSERT INTO clients (id, first_name, surname, email, phone, marketing_opt_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(clientId, firstName, surname, email, phone, marketingOptIn ? 1 : 0, now, now));
  statements.push(env.DB.prepare("UPDATE availability_slots SET status = 'booked', updated_at = ? WHERE id = ? AND status = 'available'").bind(now, slotId));
  statements.push(env.DB.prepare("INSERT INTO bookings (id, slot_id, client_id, service_id, booked_service_id, date, start_time, price_pence, addons_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)").bind(bookingId, slotId, clientId, serviceId, effectiveService.id, slot.date, slot.start_time, totalPrice, JSON.stringify(addons), now, now));
  statements.push(env.DB.prepare("INSERT INTO booking_events (id, booking_id, event_type, metadata_json, created_at) VALUES (?, ?, 'created', ?, ?)").bind(crypto.randomUUID(), bookingId, JSON.stringify({ requestedServiceId: serviceId, bookedServiceId: effectiveService.id, infillChanged, qualifyingDate, totalPrice }), now));
  const results = await env.DB.batch(statements);
  if (!results[1]?.meta?.changes) return json({ error: "That appointment was just booked by someone else. Please choose another slot." }, 409, origin);
  return json({ ok: true, booking: { id: bookingId, date: slot.date, startTime: slot.start_time, service: effectiveService.name, requestedService: service.name, price: totalPrice, infillChanged, clientReturning: Boolean(existingClient) } }, 201, origin);
}

async function adminLogin(request, env, origin) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Booking admin login has not been configured yet." }, 503, origin);
  const body = await request.json(), email = normaliseEmail(body.email), password = String(body.password || "");
  if (email !== normaliseEmail(env.ADMIN_EMAIL) || password !== env.ADMIN_PASSWORD) return json({ error: "Incorrect email or password." }, 401, origin);
  const payload = `${email}|${Date.now() + ADMIN_SESSION_MAX_AGE * 1000}`, signature = await sign(payload, env.SESSION_SECRET);
  return json({ ok: true, token: `${b64url(payload)}.${signature}` }, 200, origin);
}
async function requireAdmin(request, env, origin, handler) { return await readSession(request, env) ? handler() : json({ error: "Not authorised." }, 401, origin); }
async function readSession(request, env) { if (!env.SESSION_SECRET) return null; const auth = request.headers.get("Authorization") || "", token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null; if (!token) return null; const [encoded, signature] = token.split("."); if (!encoded || !signature) return null; try { const payload = fromB64url(encoded); if (!safeEqual(signature, await sign(payload, env.SESSION_SECRET))) return null; const i = payload.lastIndexOf("|"), email = payload.slice(0, i), expiry = Number(payload.slice(i + 1)); if (!email || !Number.isFinite(expiry) || Date.now() > expiry) return null; if (env.ADMIN_EMAIL && email !== normaliseEmail(env.ADMIN_EMAIL)) return null; return { email, expiry }; } catch { return null; } }

async function adminAvailability(env, origin) { const result = await env.DB.prepare("SELECT id, date, start_time, service_ids_json, status, created_at FROM availability_slots ORDER BY date, start_time").all(); return json({ slots: (result.results || []).map(row => ({ ...row, serviceIds: parseJson(row.service_ids_json, []) })) }, 200, origin, { "Cache-Control": "no-store" }); }
async function addAvailability(request, env, origin) { const body = await request.json(), date = cleanDate(body.date), startTime = cleanTime(body.startTime), serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds.filter(id => SERVICES.some(s => s.id === id && s.bookable)) : []; if (!date || !startTime) return json({ error: "Please provide a date and time." }, 400, origin); const now = new Date().toISOString(); const result = await env.DB.prepare("INSERT INTO availability_slots (date, start_time, service_ids_json, status, created_at, updated_at) VALUES (?, ?, ?, 'available', ?, ?)").bind(date, startTime, JSON.stringify(serviceIds), now, now).run(); return json({ ok: true, id: result.meta.last_row_id }, 201, origin); }
async function deleteAvailability(id, env, origin) { if (!Number.isInteger(id)) return json({ error: "Invalid slot." }, 400, origin); const row = await env.DB.prepare("SELECT status FROM availability_slots WHERE id = ?").bind(id).first(); if (!row) return json({ error: "Slot not found." }, 404, origin); if (row.status === "booked") return json({ error: "A booked slot cannot be deleted. Cancel the booking instead." }, 409, origin); await env.DB.prepare("DELETE FROM availability_slots WHERE id = ?").bind(id).run(); return json({ ok: true }, 200, origin); }
async function adminBookings(env, origin) { const result = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.price_pence,b.status,b.service_id,b.booked_service_id,b.addons_json,c.first_name,c.surname,c.email,c.phone FROM bookings b JOIN clients c ON c.id=b.client_id ORDER BY b.date DESC,b.start_time DESC").all(); return json({ bookings: (result.results || []).map(row => ({ ...row, requestedService: serviceName(row.service_id), bookedService: serviceName(row.booked_service_id), addons: parseJson(row.addons_json, {}) })) }, 200, origin, { "Cache-Control": "no-store" }); }
async function updateBookingStatus(id, request, env, origin) { if (!Number.isInteger(id)) return json({ error: "Invalid booking." }, 400, origin); const status = (await request.json()).status; if (!["confirmed","completed","cancelled"].includes(status)) return json({ error: "Invalid status." }, 400, origin); const booking = await env.DB.prepare("SELECT slot_id FROM bookings WHERE id = ?").bind(id).first(); if (!booking) return json({ error: "Booking not found." }, 404, origin); const now = new Date().toISOString(); await env.DB.batch([env.DB.prepare("UPDATE bookings SET status=?,updated_at=? WHERE id=?").bind(status, now, id), env.DB.prepare("UPDATE availability_slots SET status=?,updated_at=? WHERE id=?").bind(status === "cancelled" ? "available" : "booked", now, booking.slot_id), env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, status, JSON.stringify({ source: "admin" }), now)]); return json({ ok: true }, 200, origin); }
async function calendarToken(env, origin) { let row = await env.DB.prepare("SELECT value FROM settings WHERE key='calendar_token'").first(); if (!row) { const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""); await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('calendar_token',?,?)").bind(token, new Date().toISOString()).run(); row = { value: token }; } const base = env.BOOKING_PUBLIC_URL || "https://autumn-nails-booking.workers.dev"; return json({ url: `${base.replace(/\/$/, "")}/calendar/${encodeURIComponent(row.value)}.ics` }, 200, origin); }
async function calendarFeed(token, env) { const expected = await env.DB.prepare("SELECT value FROM settings WHERE key='calendar_token'").first(); if (!expected || token.replace(/\.ics$/, "") !== expected.value) return new Response("Not found", { status: 404 }); const result = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.status,b.booked_service_id,c.first_name,c.surname FROM bookings b JOIN clients c ON c.id=b.client_id WHERE b.status IN ('confirmed','completed') ORDER BY b.date,b.start_time").all(); const stamp = toIcsDateTime(new Date().toISOString().slice(0,10), new Date().toISOString().slice(11,16)); const events=(result.results||[]).map(row=>["BEGIN:VEVENT",`UID:booking-${row.id}@autumnnails.com`,`DTSTAMP:${stamp}Z`,`DTSTART;TZID=Europe/London:${toIcsDateTime(row.date,row.start_time)}`,`SUMMARY:${escapeIcs(`Autumn Nails – ${row.first_name} ${row.surname}`)}`,`DESCRIPTION:${escapeIcs(serviceName(row.booked_service_id))}`,"END:VEVENT"].join("\r\n")); const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Autumn Nails//Booking Calendar//EN","CALSCALE:GREGORIAN","X-WR-CALNAME:Autumn Nails",...events,"END:VCALENDAR",""] .join("\r\n"); return new Response(ics,{status:200,headers:{"Content-Type":"text/calendar; charset=utf-8","Cache-Control":"no-store","Content-Disposition":"inline; filename=autumn-nails.ics"}}); }
function serviceName(id){return SERVICES.find(s=>s.id===id)?.name||id;} function normaliseAddons(value){if(!value||typeof value!=="object")return{};const r={};for(const s of SERVICES.filter(x=>x.addon)){const q=Math.max(0,Math.min(10,Number(value[s.id]||0)));if(Number.isFinite(q)&&q>0)r[s.id]=Math.floor(q);}return r;} function parseJson(value,fallback){try{return JSON.parse(value||"")}catch{return fallback}} function cleanText(value,max){return String(value||"").trim().replace(/\s+/g," ").slice(0,max)} function normaliseEmail(value){return String(value||"").trim().toLowerCase().slice(0,254)} function cleanDate(value){const text=String(value||"");return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:""} function cleanTime(value){const text=String(value||"");return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)?text:""} function daysBetween(from,to){return Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000)} function toIcsDateTime(date,time){return `${date.replace(/-/g,"")}T${time.replace(":","")}00`} function escapeIcs(value){return String(value).replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/([,;])/g,"\\$1")}
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))} function safeEqual(a,b){if(a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0} function b64url(value){const bytes=typeof value==="string"?new TextEncoder().encode(value):new Uint8Array(value);let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")} function fromB64url(value){const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);return new TextDecoder().decode(Uint8Array.from(atob(padded),c=>c.charCodeAt(0)))}
