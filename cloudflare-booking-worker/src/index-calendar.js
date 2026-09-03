import phase4Worker from "./index-phase4.js";
import { durationForServices } from "./duration-config.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/calendar\/event\/([^/]+)$/);
    if (request.method === "GET" && match) return calendarChooser(decodeURIComponent(match[1]), env);

    const response = await phase4Worker.fetch(request, env, ctx);
    if (request.method === "POST" && url.pathname === "/api/book" && response.status === 201) {
      try {
        const data = await response.clone().json();
        if (data?.booking?.id) {
          data.booking.calendarUrl = new URL(`/calendar/event/${encodeURIComponent(data.booking.id)}`, request.url).toString();
          const headers = new Headers(response.headers);
          headers.delete("Content-Encoding");
          headers.delete("Content-Length");
          headers.set("Content-Type", "application/json; charset=utf-8");
          return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
        }
      } catch (error) { console.error("Unable to add universal calendar URL:", error); }
    }
    return response;
  }
};

async function calendarChooser(bookingId, env) {
  const id = String(bookingId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.status,b.booked_service_id FROM bookings b WHERE b.id=? LIMIT 1").bind(id).first();
  if (!row || row.status === "cancelled") return new Response("Not found", { status: 404 });
  const service = serviceName(row.booked_service_id);
  const duration = durationForServices([row.booked_service_id]);
  const endTime = addMinutesToTime(row.start_time, duration);
  const location = String(env.BOOKING_LOCATION || "").trim();
  const dates = `${icsDate(row.date, row.start_time)}/${icsDate(row.date, endTime)}`;
  const googleParams = new URLSearchParams({ action: "TEMPLATE", text: `Autumn Nails – ${service}`, dates, ctz: "Europe/London", details: `${service} appointment at Autumn Nails.` });
  if (location) googleParams.set("location", location);
  const googleUrl = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;
  const icsUrl = `/calendar/event/${encodeURIComponent(id)}.ics`;
  const locationLine = location ? escapeHtml(location) : "Location will be added to your calendar once the salon address is configured.";
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Add to calendar | Autumn Nails</title><style>:root{--ink:#64342d;--muted:#80584d}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#f7ebe3,#fcf5f0 46%,#f1dfd4);font-family:Arial,Helvetica,sans-serif;color:var(--ink)}main{width:min(560px,100%);background:rgba(255,250,246,.94);border:1px solid rgba(255,255,255,.9);border-radius:28px;padding:34px;box-shadow:0 24px 70px rgba(95,55,45,.12)}.brand{font:400 2rem Georgia,serif;margin-bottom:24px}.brand span{font:700 .65rem Arial,sans-serif;letter-spacing:.35em}.eyebrow{text-transform:uppercase;letter-spacing:.2em;font-size:.62rem;color:#a06b59}.title{font:400 2.35rem Georgia,serif;margin:10px 0 12px}.summary{padding:18px;border-radius:16px;background:#fff;margin:22px 0;line-height:1.7;color:var(--muted)}a{display:block;text-align:center;text-decoration:none;border-radius:999px;padding:15px 18px;margin-top:12px;font-weight:700;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase}.primary{background:var(--ink);color:#fff}.secondary{background:#fff;color:var(--ink);border:1px solid rgba(100,52,45,.16)}.note{font-size:.74rem;color:#8b6a61;line-height:1.6;margin-top:20px}</style></head><body><main><div class="brand">Autumn <span>NAILS</span></div><div class="eyebrow">Your appointment</div><h1 class="title">Add it to your calendar</h1><div class="summary"><strong>${escapeHtml(service)}</strong><br>${escapeHtml(formatDate(row.date))}<br>${escapeHtml(formatTime(row.start_time))}–${escapeHtml(formatTime(endTime))}<br><br>${locationLine}</div><a class="primary" href="${escapeAttribute(googleUrl)}">Add to Google Calendar</a><a class="secondary" href="${escapeAttribute(icsUrl)}">Download calendar file (.ics)</a><p class="note">The calendar file works with Apple Calendar, Outlook and other calendar apps. Your appointment link only contains this appointment.</p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" } });
}

function serviceName(id) { const names = { "basic-manicure": "Basic Manicure", "gel-polish": "Gel Polish", "builder-full-set": "Builder Full Set", "builder-infill": "Builder Infill", "builder-gel-full-set": "Builder & Gel Polish Full Set", "builder-gel-infill": "Builder & Gel Polish Infill", "acrylic-full-set": "Acrylic – Full Set", "express-gel-toes": "Express Gel Toes" }; return names[id] || id; }
function minutesFromMidnight(time) { const [h,m]=String(time).split(":").map(Number); return h*60+m; }
function addMinutesToTime(time, minutes) { const total=minutesFromMidnight(time)+minutes; return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; }
function icsDate(date,time) { return `${date.replace(/-/g,"")}T${time.replace(":","")}00`; }
function formatDate(value) { return new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/London"}).format(new Date(`${value}T12:00:00`)); }
function formatTime(value) { const [hour,minute]=String(value).split(":").map(Number); return `${String(hour%12||12)}:${String(minute).padStart(2,"0")}${hour>=12?"pm":"am"}`; }
function escapeHtml(value) { return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;"); }
function escapeAttribute(value) { return escapeHtml(value); }
