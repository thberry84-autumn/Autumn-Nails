import bookingWorker from "./index-history.js";
import { DEFAULT_DURATION_MINUTES, durationForService, durationForServices, addMinutesToTime, overlaps } from "./duration-config.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/availability") {
      return await availabilityWithRealDurations(request, env, ctx);
    }

    if (request.method === "POST" && url.pathname === "/api/book") {
      return await bookWithRealDurationGuard(request, env, ctx);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/manual-booking") {
      return await manualBookWithRealDurationGuard(request, env, ctx);
    }

    if (request.method === "GET" && url.pathname.startsWith("/calendar/event/")) {
      return await calendarWithRealDuration(request, env, ctx);
    }

    return bookingWorker.fetch(request, env, ctx);
  }
};

async function availabilityWithRealDurations(request, env, ctx) {
  const response = await bookingWorker.fetch(request, env, ctx);
  if (!response.ok) return response;

  try {
    const data = await response.clone().json();
    const slots = Array.isArray(data.slots) ? data.slots : [];
    const params = new URL(request.url).searchParams;
    const serviceIds = normaliseServiceIds(
      params.get("services")?.split(","),
      params.get("service")
    );
    const candidateDuration = durationForServices(serviceIds);

    const rows = await env.DB.prepare(
      "SELECT id,date,start_time,status,booked_service_id,selected_services_json FROM bookings WHERE status IN ('confirmed','completed') AND date >= date('now','localtime')"
    ).all();

    const bookings = rows.results || [];
    data.slots = slots.filter(slot => {
      return !bookings.some(booking => {
        if (booking.date !== slot.date) return false;
        const ids = selectedServiceIds(booking);
        const bookedDuration = durationForServices(ids);
        return overlaps(slot.start_time, candidateDuration, booking.start_time, bookedDuration);
      });
    }).map(slot => ({
      ...slot,
      durationMinutes: candidateDuration,
      endTime: addMinutesToTime(slot.start_time, candidateDuration)
    }));

    return jsonResponse(data, response);
  } catch (error) {
    console.error("Unable to apply duration-aware availability:", error);
    return response;
  }
}

async function bookWithRealDurationGuard(request, env, ctx) {
  const body = await request.clone().json();
  const serviceIds = normaliseServiceIds(body.services, body.serviceId);
  const duration = await effectiveDurationForBooking(body, serviceIds, env);
  const slotId = Number(body.slotId);
  const slot = await env.DB.prepare("SELECT id,date,start_time,status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(slotId).first();
  if (slot && slot.status === "available" && !slot.removed_at) {
    const conflict = await bookingOverlaps(env, slot.date, slot.start_time, duration);
    if (conflict) return corsJson({ error: "That appointment time is no longer available for the treatments selected. Please choose another time." }, 409, request);
  }

  const response = await bookingWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  return replaceBookingDuration(response, duration);
}

async function manualBookWithRealDurationGuard(request, env, ctx) {
  const body = await request.clone().json();
  const serviceIds = normaliseServiceIds(body.services, body.serviceId);
  const duration = await effectiveDurationForBooking(body, serviceIds, env);
  const slotId = Number(body.slotId);
  const slot = await env.DB.prepare("SELECT id,date,start_time,status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(slotId).first();
  if (slot && slot.status === "available" && !slot.removed_at) {
    const conflict = await bookingOverlaps(env, slot.date, slot.start_time, duration);
    if (conflict) return corsJson({ error: "That appointment time overlaps an existing booking. Please choose another time." }, 409, request);
  }

  const response = await bookingWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  return replaceBookingDuration(response, duration);
}

async function calendarWithRealDuration(request, env, ctx) {
  const id = decodeURIComponent(new URL(request.url).pathname.slice("/calendar/event/".length).replace(/\.ics$/, ""));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bookingWorker.fetch(request, env, ctx);

  const row = await env.DB.prepare("SELECT id,date,start_time,status,booked_service_id,selected_services_json FROM bookings WHERE id=? LIMIT 1").bind(id).first();
  if (!row || row.status === "cancelled") return bookingWorker.fetch(request, env, ctx);

  const duration = durationForServices(selectedServiceIds(row));
  const endTime = addMinutesToTime(row.start_time, duration);
  const names = selectedServiceIds(row).map(serviceName);
  const summary = `Autumn Nails – ${names.join(" + ")}`;
  const dt = (date, time) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
  const stamp = dt(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(11, 16));
  const escapeIcs = value => String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Autumn Nails//Booking//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:booking-${row.id}@autumnnails.com`, `DTSTAMP:${stamp}Z`,
    `DTSTART;TZID=Europe/London:${dt(row.date, row.start_time)}`,
    `DTEND;TZID=Europe/London:${dt(row.date, endTime)}`,
    `SUMMARY:${escapeIcs(summary)}`, `DESCRIPTION:${escapeIcs(summary)}`,
    "END:VEVENT", "END:VCALENDAR", ""
  ].join("\r\n");

  return new Response(ics, { status: 200, headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": "attachment; filename=autumn-nails-appointment.ics",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }});
}

async function bookingOverlaps(env, date, startTime, duration) {
  const result = await env.DB.prepare(
    "SELECT date,start_time,booked_service_id,selected_services_json FROM bookings WHERE date=? AND status IN ('confirmed','completed')"
  ).bind(date).all();
  return (result.results || []).some(row => overlaps(startTime, duration, row.start_time, durationForServices(selectedServiceIds(row))));
}

async function effectiveDurationForBooking(body, serviceIds, env) {
  const ids = serviceIds.length ? serviceIds : [String(body.serviceId || "")];
  if (!ids.length) return DEFAULT_DURATION_MINUTES;

  const email = String(body.email || "").trim().toLowerCase();
  const fallback = { "builder-infill": "builder-full-set", "builder-gel-infill": "builder-gel-full-set" };
  if (email) {
    const client = await env.DB.prepare("SELECT id FROM clients WHERE email=? LIMIT 1").bind(email).first();
    if (client) {
      for (const id of ids) {
        const fallbackId = fallback[id];
        if (!fallbackId) continue;
        const qualifying = await env.DB.prepare("SELECT date FROM bookings WHERE client_id=? AND service_id=? AND status='completed' ORDER BY date DESC,start_time DESC LIMIT 1").bind(client.id, id === "builder-infill" ? "builder-full-set" : "builder-gel-full-set").first();
        const days = qualifying?.date ? daysBetween(qualifying.date, String(body.date || "")) : null;
        if (days === null || days > 21 || days < 0) {
          return durationForServices(ids.map(value => value === id ? fallbackId : value));
        }
      }
    }
  }
  return durationForServices(ids);
}

function selectedServiceIds(row) {
  try {
    const items = JSON.parse(row.selected_services_json || "[]");
    if (Array.isArray(items) && items.length) return items.map(item => item.id || item).filter(Boolean);
  } catch {}
  return row.booked_service_id ? [row.booked_service_id] : [];
}

function normaliseServiceIds(value, fallback) {
  const source = Array.isArray(value) ? value : [fallback];
  return [...new Set(source.map(v => String(v || "").trim()).filter(Boolean))];
}

function serviceName(id) {
  return ({
    "basic-manicure": "Basic Manicure", "gel-polish": "Gel Polish", "builder-full-set": "Builder Full Set",
    "builder-infill": "Builder Infill", "builder-gel-full-set": "Builder & Gel Polish Full Set",
    "builder-gel-infill": "Builder & Gel Polish Infill", "acrylic-full-set": "Acrylic – Full Set",
    "express-gel-toes": "Express Gel Toes"
  })[id] || id;
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

async function replaceBookingDuration(response, duration) {
  try {
    const data = await response.clone().json();
    if (!data?.booking) return response;
    data.booking.durationMinutes = duration;
    data.booking.endTime = addMinutesToTime(data.booking.startTime, duration);
    return jsonResponse(data, response);
  } catch {
    return response;
  }
}

function jsonResponse(data, response) {
  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

function corsJson(data, status, request) {
  const origin = request.headers.get("Origin") === "https://www.autumnnails.com" ? "https://www.autumnnails.com" : "https://autumnnails.com";
  return new Response(JSON.stringify(data), { status, headers: {
    "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin"
  }});
}
