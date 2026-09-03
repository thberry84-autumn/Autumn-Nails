import productionWorker from "./index-production.js";
import { durationForServices, addMinutesToTime } from "./duration-config.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname.startsWith("/calendar/event/")) {
      return calendarEvent(env, url.pathname.slice("/calendar/event/".length));
    }

    if (request.method === "GET" && url.pathname.startsWith("/calendar/")) {
      return calendarFeed(env, url.pathname.slice("/calendar/".length));
    }

    const response = await productionWorker.fetch(request, env, ctx);

    if (request.method === "GET" && url.pathname === "/api/admin/bookings" && response.ok) {
      try {
        const data = await response.clone().json();
        if (Array.isArray(data.bookings)) {
          data.bookings = data.bookings.filter(booking => booking.status !== "cancelled");
          return json(data, response.status, request);
        }
      } catch {}
    }

    return response;
  }
};

async function calendarEvent(env, rawId) {
  const id = decodeURIComponent(String(rawId || "").replace(/\.ics$/, ""));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.status,b.booked_service_id,b.selected_services_json,c.first_name,c.surname FROM bookings b JOIN clients c ON c.id=b.client_id WHERE b.id=? LIMIT 1").bind(id).first();
  if (!row || row.status === "cancelled") return new Response("Not found", { status: 404 });
  const ids = selectedServiceIds(row);
  const names = ids.map(serviceName);
  const customerName = `${String(row.first_name || "").trim()} ${String(row.surname || "").trim()}`.trim();
  const duration = durationForServices(ids.length ? ids : [row.booked_service_id]);
  const endTime = addMinutesToTime(row.start_time, duration);
  const summary = customerName ? `Autumn Nails – ${customerName} – ${names.join(" + ")}` : `Autumn Nails – ${names.join(" + ")}`;
  const dt = (date, time) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
  const stamp = dt(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(11, 16));
  const location = String(env.BOOKING_LOCATION || "Autumn Nails, Portsmouth").trim();
  const escapeIcs = value => String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Autumn Nails//Booking//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:booking-${row.id}@autumnnails.com`, `DTSTAMP:${stamp}Z`,
    `DTSTART;TZID=Europe/London:${dt(row.date, row.start_time)}`,
    `DTEND;TZID=Europe/London:${dt(row.date, endTime)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `LOCATION:${escapeIcs(location)}`,
    `DESCRIPTION:${escapeIcs(names.join(" + "))}`,
    "END:VEVENT", "END:VCALENDAR", ""
  ].join("\r\n");
  return new Response(ics, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=autumn-nails-appointment.ics", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function calendarFeed(env, rawToken) {
  const token = decodeURIComponent(String(rawToken || "").replace(/\.ics$/, ""));
  const expected = await env.DB.prepare("SELECT value FROM settings WHERE key='calendar_token'").first();
  if (!expected || token !== expected.value) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const result = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.status,b.booked_service_id,b.selected_services_json,c.first_name,c.surname FROM bookings b JOIN clients c ON c.id=b.client_id WHERE b.status IN ('confirmed','completed') ORDER BY b.date,b.start_time").all();
  const stamp = toIcsDateTime(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(11, 16));
  const escapeIcs = value => String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const events = (result.results || []).map(row => {
    const ids = selectedServiceIds(row);
    const customerName = `${String(row.first_name || "").trim()} ${String(row.surname || "").trim()}`.trim();
    const duration = durationForServices(ids.length ? ids : [row.booked_service_id]);
    const endTime = addMinutesToTime(row.start_time, duration);
    const title = customerName ? `Autumn Nails – ${customerName}` : `Autumn Nails – ${serviceName(row.booked_service_id)}`;
    return [
      "BEGIN:VEVENT", `UID:booking-${row.id}@autumnnails.com`, `DTSTAMP:${stamp}Z`,
      `DTSTART;TZID=Europe/London:${toIcsDateTime(row.date, row.start_time)}`,
      `DTEND;TZID=Europe/London:${toIcsDateTime(row.date, endTime)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(ids.map(serviceName).join(" + "))}`,
      "END:VEVENT"
    ].join("\r\n");
  });
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Autumn Nails//Booking Calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Autumn Nails",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M", ...events, "END:VCALENDAR", ""
  ].join("\r\n");
  return new Response(ics, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=autumn-nails.ics", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function selectedServiceIds(row) {
  try {
    const items = JSON.parse(row.selected_services_json || "[]");
    if (Array.isArray(items) && items.length) return items.map(item => item.id || item).filter(Boolean);
  } catch {}
  return row.booked_service_id ? [row.booked_service_id] : [];
}

function serviceName(id) {
  return ({
    "basic-manicure": "Basic Manicure", "gel-polish": "Gel Polish", "builder-full-set": "Builder Full Set",
    "builder-infill": "Builder Infill", "builder-gel-full-set": "Builder & Gel Polish Full Set",
    "builder-gel-infill": "Builder & Gel Polish Infill", "acrylic-full-set": "Acrylic – Full Set",
    "express-gel-toes": "Express Gel Toes"
  })[id] || id;
}

function toIcsDateTime(date, time) { return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`; }

function json(data, status, request) {
  const origin = request.headers.get("Origin");
  const allowed = origin === "https://autumnnails.com" || origin === "https://www.autumnnails.com" ? origin : "https://autumnnails.com";
  return new Response(JSON.stringify(data), { status, headers: {
    "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Vary": "Origin", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"
  }});
}
