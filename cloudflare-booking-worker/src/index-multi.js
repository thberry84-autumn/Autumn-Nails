import bookingWorker from "./index-snagging.js";

const SERVICES = {
  "basic-manicure": ["Basic Manicure", 1500],
  "gel-polish": ["Gel Polish", 2200],
  "builder-full-set": ["Builder Full Set", 2800],
  "builder-infill": ["Builder Infill", 2500],
  "builder-gel-full-set": ["Builder & Gel Polish Full Set", 3000],
  "builder-gel-infill": ["Builder & Gel Polish Infill", 2700],
  "acrylic-full-set": ["Acrylic – Full Set", 3500],
  "express-gel-toes": ["Express Gel Toes", 2200]
};
const ADDONS = {
  "nail-art": ["Nail Art (per nail)", 100],
  "nail-stamping": ["Nail Stamping (per nail)", 100],
  "nail-stamping-full-set": ["Nail Stamping (full set, per colour)", 600]
};
const SITE_ORIGINS = new Set(["https://autumnnails.com", "https://www.autumnnails.com"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.startsWith("/calendar/event/")) {
      const id = decodeURIComponent(url.pathname.slice("/calendar/event/".length).replace(/\.ics$/, ""));
      const row = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.status,b.booked_service_id,b.selected_services_json FROM bookings b WHERE b.id=? LIMIT 1").bind(id).first();
      const items = parseJson(row?.selected_services_json, []);
      if (row && items.length > 1 && row.status !== "cancelled") return calendarEvent(row, items);
    }

    if (!(request.method === "POST" && url.pathname === "/api/book")) return bookingWorker.fetch(request, env, ctx);
    const original = await request.json();
    const serviceIds = normaliseServices(original.services, original.serviceId);
    if (serviceIds.length <= 1) return bookingWorker.fetch(request, env, ctx);

    const invalid = serviceIds.find(id => !SERVICES[id]);
    if (invalid || new Set(serviceIds).size !== serviceIds.length) return json({ error: "Please choose valid, different services." }, 400, request);

    const slotId = Number(original.slotId);
    const slot = await env.DB.prepare("SELECT id,date,start_time,status,removed_at,service_ids_json FROM availability_slots WHERE id=? LIMIT 1").bind(slotId).first();
    if (!slot || slot.status !== "available" || slot.removed_at) return json({ error: "That appointment is no longer available. Please choose another slot." }, 409, request);
    const allowed = parseJson(slot.service_ids_json, []);
    if (allowed.length && serviceIds.some(id => !allowed.includes(id))) return json({ error: "One or more selected services are not available at that appointment time." }, 409, request);

    const primary = serviceIds[0];
    const forwarded = { ...original, serviceId: primary };
    delete forwarded.services;
    const innerRequest = new Request(request, { body: JSON.stringify(forwarded) });
    const innerEnv = new Proxy(env, { get(target, prop) { return prop === "EMAIL" ? undefined : target[prop]; } });
    const response = await bookingWorker.fetch(innerRequest, innerEnv, ctx);
    if (response.status !== 201) return response;

    const payload = await response.clone().json();
    const booking = payload?.booking;
    if (!booking?.id) return response;

    const primaryEffectiveId = booking.requestedService !== booking.service ? "" : primary;
    const primaryPrice = Number(booking.price || 0) - addonTotal(original.addons);
    const primaryEffectivePrice = primaryEffectiveId ? SERVICES[primary][1] : primaryPrice;
    const additional = serviceIds.slice(1).map(id => ({ id, name: SERVICES[id][0], price: SERVICES[id][1] }));
    const additionalTotal = additional.reduce((sum, item) => sum + item.price, 0);
    const total = primaryEffectivePrice + additionalTotal + addonTotal(original.addons);
    const serviceItems = [{ id: booking.service === SERVICES[primary]?.[0] ? primary : primary, name: booking.service, price: primaryEffectivePrice }, ...additional];
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE bookings SET price_pence=?, final_price_pence=?, selected_services_json=?, updated_at=? WHERE id=?").bind(total, total, JSON.stringify(serviceItems), now, booking.id).run();
    await env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), booking.id, "services_added", JSON.stringify({ serviceIds, additionalServices: additional, totalPrice: total }), now).run();

    const calendarUrl = booking.calendarUrl;
    booking.price = total;
    booking.serviceItems = serviceItems;
    booking.services = serviceItems.map(item => item.name);
    booking.service = serviceItems.map(item => item.name).join(" + ");
    payload.booking = booking;

    if (env.EMAIL) ctx?.waitUntil(sendMultiServiceEmails(env, original, booking, calendarUrl));
    const headers = new Headers(response.headers);
    headers.delete("Content-Encoding"); headers.delete("Content-Length"); headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(payload), { status: 201, headers });
  }
};

function normaliseServices(value, fallback) {
  const source = Array.isArray(value) ? value : [fallback];
  return [...new Set(source.map(v => String(v || "").trim()).filter(Boolean))];
}
function addonTotal(value) {
  if (!value || typeof value !== "object") return 0;
  return Object.entries(ADDONS).reduce((sum, [id, meta]) => {
    const qty = Math.min(10, Math.max(0, Math.floor(Number(value[id] || 0))));
    return sum + (Number.isFinite(qty) ? meta[1] * qty : 0);
  }, 0);
}
function parseJson(value, fallback) { try { const parsed = JSON.parse(value || ""); return parsed ?? fallback; } catch { return fallback; } }
function json(data, status, request) { const originHeader = request.headers.get("Origin"); const origin = SITE_ORIGINS.has(originHeader) ? originHeader : "https://autumnnails.com"; return new Response(JSON.stringify(data), { status, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" } }); }
function formatMoney(pence) { return `£${(Number(pence || 0) / 100).toFixed(2)}`; }
function addMinutes(time, minutes) { const [h,m] = String(time).split(":").map(Number); const total = h*60+m+minutes; return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; }
function icsDate(date,time){return `${date.replace(/-/g,"")}T${time.replace(":","")}00`;}
function escIcs(v){return String(v).replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/([,;])/g,"\\$1");}
function calendarEvent(row, items) { const summary = `Autumn Nails – ${items.map(i=>i.name).join(" + ")}`; const stamp = icsDate(new Date().toISOString().slice(0,10),new Date().toISOString().slice(11,16)); const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Autumn Nails//Booking//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",`UID:booking-${row.id}@autumnnails.com`,`DTSTAMP:${stamp}Z`,`DTSTART;TZID=Europe/London:${icsDate(row.date,row.start_time)}`,`DTEND;TZID=Europe/London:${icsDate(row.date,addMinutes(row.start_time,120))}`,`SUMMARY:${escIcs(summary)}`,`DESCRIPTION:${escIcs(items.map(i=>i.name).join(" + "))}`,"END:VEVENT","END:VCALENDAR",""] .join("\r\n"); return new Response(ics,{status:200,headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":"attachment; filename=autumn-nails-appointment.ics","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}); }
async function sendMultiServiceEmails(env, body, booking, calendarUrl) {
  const name = `${clean(body.firstName)} ${clean(body.surname)}`.trim(), email = String(body.email||"").trim().toLowerCase(), phone=clean(body.phone), date=formatDate(booking.date), time=`${formatTime(booking.startTime)} – ${formatTime(booking.endTime)}`, services=booking.services.join(" + "), addons=formatAddons(body.addons), price=formatMoney(booking.price);
  const text=["A new Autumn Nails appointment has been booked.","",`Client: ${name}`,`Email: ${email}`,`Phone: ${phone}`,`Date: ${date}`,`Time: ${time}`,`Services: ${services}`,`Price: ${price}`,addons.length?`Add-ons: ${addons.join(", ")}`:"Add-ons: None","",`Add this appointment to your calendar: ${calendarUrl}`].join("\n");
  const clientText=[`Hi ${name.split(" ")[0]||"there"},`,"","Thank you for booking with Autumn Nails. Your appointment is confirmed.","",date,time,services,price,addons.length?`Add-ons: ${addons.join(", ")}`:"",`Add this appointment to your calendar: ${calendarUrl}`,"","We look forward to seeing you!","","Autumn Nails"].filter(Boolean).join("\n");
  await Promise.allSettled([env.EMAIL.send({from:{email:"bookings@autumnnails.com",name:"Autumn Nails"},replyTo:"bookings@autumnnails.com",to:"autumnnails.uk@gmail.com",subject:`New booking – ${name} – ${date}`,text}),env.EMAIL.send({from:{email:"bookings@autumnnails.com",name:"Autumn Nails"},replyTo:"bookings@autumnnails.com",to:email,subject:"Your Autumn Nails appointment is confirmed",text:clientText})]);
}
function clean(v){return String(v||"").trim().replace(/\s+/g," ").slice(0,100);}
function formatDate(v){return new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/London"}).format(new Date(`${v}T12:00:00`));}
function formatTime(v){const[h,m]=String(v).split(":").map(Number);return`${String(h%12||12)}:${String(m).padStart(2,"0")}${h>=12?"pm":"am"}`;}
function formatAddons(value){if(!value||typeof value!=="object")return[];return Object.entries(ADDONS).flatMap(([id,meta])=>{const q=Math.min(10,Math.max(0,Math.floor(Number(value[id]||0))));return Number.isFinite(q)&&q>0?[`${meta[0]} × ${q}`]:[];});}
