import bookingWorker from "./index-history.js";
import { DEFAULT_DURATION_MINUTES, durationForServices, addMinutesToTime, overlaps } from "./duration-config.js";

const BUSINESS_EMAIL = "autumnnails.uk@gmail.com";
const EMAIL_FROM = "bookings@autumnnails.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/availability") return await availabilityWithRealDurations(request, env, ctx);
    if (request.method === "POST" && url.pathname === "/api/book") return await bookWithRealDurationGuard(request, env, ctx);
    if (request.method === "POST" && url.pathname === "/api/admin/manual-booking") return await manualBookWithRealDurationGuard(request, env, ctx);
    if (request.method === "GET" && url.pathname.startsWith("/calendar/event/")) return await calendarWithRealDuration(request, env, ctx);
    return bookingWorker.fetch(request, env, ctx);
  }
};

async function availabilityWithRealDurations(request, env, ctx) {
  const incomingUrl = new URL(request.url);
  const requestedServices = incomingUrl.searchParams.get("services");
  if (!incomingUrl.searchParams.get("service") && requestedServices) {
    const firstService = requestedServices.split(",").map(value => value.trim()).find(Boolean);
    if (firstService) {
      incomingUrl.searchParams.set("service", firstService);
      request = new Request(incomingUrl.toString(), request);
    }
  }
  const response = await bookingWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  try {
    const data = await response.clone().json();
    const slots = Array.isArray(data.slots) ? data.slots : [];
    const params = new URL(request.url).searchParams;
    const serviceIds = normaliseServiceIds(params.get("services")?.split(","), params.get("service"));
    const candidateDuration = durationForServices(serviceIds);
    const rows = await env.DB.prepare("SELECT id,date,start_time,status,booked_service_id,selected_services_json FROM bookings WHERE status IN ('confirmed','completed') AND date >= date('now','localtime')").all();
    const bookings = rows.results || [];
    data.slots = slots.filter(slot => {
      if (isWeekday(slot.date) && bookings.some(booking => booking.date === slot.date)) return false;
      return !bookings.some(booking => {
        if (booking.date !== slot.date) return false;
        return overlaps(slot.start_time, candidateDuration, booking.start_time, durationForServices(selectedServiceIds(booking)));
      });
    }).map(slot => ({ ...slot, durationMinutes: candidateDuration, endTime: addMinutesToTime(slot.start_time, candidateDuration) }));
    return jsonResponse(data, response);
  } catch (error) {
    console.error("Unable to apply duration-aware availability:", error);
    return response;
  }
}

async function bookWithRealDurationGuard(request, env, ctx) {
  const body = await request.clone().json();
  const serviceIds = normaliseServiceIds(body.services, body.serviceId);
  const slotId = Number(body.slotId);
  const slot = await env.DB.prepare("SELECT id,date,start_time,status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(slotId).first();
  if (slot?.date && await weekdayHasBooking(env, slot.date)) return corsJson({ error: "That weekday is already fully booked. Please choose another day." }, 409, request);
  const duration = await effectiveDurationForBooking(body, serviceIds, env, slot?.date);
  if (slot && slot.status === "available" && !slot.removed_at) {
    if (isPastLondonSlot(slot.date, slot.start_time)) return corsJson({ error: "That appointment time has already passed. Please choose another time." }, 409, request);
    const conflict = await bookingOverlaps(env, slot.date, slot.start_time, duration);
    if (conflict) return corsJson({ error: "That appointment time is no longer available for the treatments selected. Please choose another time." }, 409, request);
  }
  const response = await bookingWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  const adjusted = await replaceBookingDuration(response, duration);
  if (env.EMAIL) {
    try {
      const payload = await adjusted.clone().json();
      if (payload?.booking?.id) ctx?.waitUntil(sendBookingEmails(env, body, payload.booking, duration));
    } catch (error) {
      console.error("Unable to prepare booking confirmation emails:", error);
    }
  }
  return adjusted;
}

async function manualBookWithRealDurationGuard(request, env, ctx) {
  const body = await request.clone().json();
  const serviceIds = normaliseServiceIds(body.services, body.serviceId);
  const slotId = Number(body.slotId);
  const slot = await env.DB.prepare("SELECT id,date,start_time,status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(slotId).first();
  if (slot?.date && await weekdayHasBooking(env, slot.date)) return corsJson({ error: "That weekday is already fully booked. Please choose another day." }, 409, request);
  const duration = await effectiveDurationForBooking(body, serviceIds, env, slot?.date);
  if (slot && slot.status === "available" && !slot.removed_at) {
    if (isPastLondonSlot(slot.date, slot.start_time)) return corsJson({ error: "That appointment time has already passed. Please choose another time." }, 409, request);
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
  const row = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.status,b.booked_service_id,b.selected_services_json,c.first_name,c.surname FROM bookings b JOIN clients c ON c.id=b.client_id WHERE b.id=? LIMIT 1").bind(id).first();
  if (!row || row.status === "cancelled") return bookingWorker.fetch(request, env, ctx);
  const duration = durationForServices(selectedServiceIds(row));
  const endTime = addMinutesToTime(row.start_time, duration);
  const names = selectedServiceIds(row).map(serviceName);
  const customerName = `${String(row.first_name || "").trim()} ${String(row.surname || "").trim()}`.trim();
  const summary = customerName ? `Autumn Nails – ${customerName} – ${names.join(" + ")}` : `Autumn Nails – ${names.join(" + ")}`;
  const dt = (date, time) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
  const stamp = dt(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(11, 16));
  const escapeIcs = value => String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const location = String(env.BOOKING_LOCATION || "Autumn Nails, Portsmouth").trim();
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Autumn Nails//Booking//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:booking-${row.id}@autumnnails.com`, `DTSTAMP:${stamp}Z`, `DTSTART;TZID=Europe/London:${dt(row.date, row.start_time)}`, `DTEND;TZID=Europe/London:${dt(row.date, endTime)}`, `SUMMARY:${escapeIcs(summary)}`, `LOCATION:${escapeIcs(location)}`, `DESCRIPTION:${escapeIcs(summary)}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  return new Response(ics, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "attachment; filename=autumn-nails-appointment.ics", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function bookingOverlaps(env, date, startTime, duration) {
  const result = await env.DB.prepare("SELECT date,start_time,booked_service_id,selected_services_json FROM bookings WHERE date=? AND status IN ('confirmed','completed')").bind(date).all();
  return (result.results || []).some(row => overlaps(startTime, duration, row.start_time, durationForServices(selectedServiceIds(row))));
}

async function weekdayHasBooking(env, date) {
  if (!isWeekday(date)) return false;
  const existing = await env.DB.prepare("SELECT id FROM bookings WHERE date=? AND status IN ('confirmed','completed') LIMIT 1").bind(date).first();
  return Boolean(existing);
}

function isWeekday(date) {
  const value = String(date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function isPastLondonSlot(date, startTime, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{2}:\d{2}$/.test(String(startTime || ""))) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const current = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const today = `${current.year}-${current.month}-${current.day}`;
  if (date < today) return true;
  if (date > today) return false;
  const [hour, minute] = startTime.split(":").map(Number);
  return hour * 60 + minute <= Number(current.hour) * 60 + Number(current.minute);
}

async function effectiveDurationForBooking(body, serviceIds, env, targetDate) {
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
        const days = qualifying?.date && targetDate ? daysBetween(qualifying.date, String(targetDate)) : null;
        if (days === null || days > 21 || days < 0) return durationForServices(ids.map(value => value === id ? fallbackId : value));
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
  return ({ "basic-manicure": "Basic Manicure", "gel-polish": "Gel Polish", "builder-full-set": "Builder Full Set", "builder-infill": "Builder Infill", "builder-gel-full-set": "Builder & Gel Polish Full Set", "builder-gel-infill": "Builder & Gel Polish Infill", "acrylic-full-set": "Acrylic – Full Set", "express-gel-toes": "Express Gel Toes" })[id] || id;
}

function daysBetween(from, to) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000); }

async function replaceBookingDuration(response, duration) {
  try {
    const data = await response.clone().json();
    if (!data?.booking) return response;
    data.booking.durationMinutes = duration;
    data.booking.endTime = addMinutesToTime(data.booking.startTime, duration);
    return jsonResponse(data, response);
  } catch { return response; }
}

async function sendBookingEmails(env, body, booking, duration) {
  const firstName = cleanText(body.firstName, 80);
  const surname = cleanText(body.surname, 80);
  const email = normaliseEmail(body.email);
  if (!email) return;
  const customerName = `${firstName} ${surname}`.trim();
  const date = formatDate(booking.date);
  const time = `${formatTime(booking.startTime)} – ${formatTime(addMinutesToTime(booking.startTime, duration))}`;
  const service = String(booking.service || "").trim();
  const price = formatMoney(booking.price);
  const addonLines = formatAddons(body.addons);
  const infillNote = booking.infillChanged ? "The requested infill was outside the 3-week window, so the booking has been changed to the applicable full-set service." : "";
  const calendarUrl = booking.calendarUrl || `${new URL("/calendar/event/" + encodeURIComponent(booking.id) + ".ics", "https://autumn-nails-booking.workers.dev").toString()}`;
  const location = String(env.BOOKING_LOCATION || "Autumn Nails, Portsmouth").trim();
  const details = [`Date: ${date}`, `Time: ${time}`, `Treatment: ${service}`, `Price: ${price}`, addonLines.length ? `Add-ons: ${addonLines.join(", ")}` : "Add-ons: None", `Location: ${location}`, infillNote].filter(Boolean);
  const businessText = ["A new Autumn Nails appointment has been booked.", "", `Client: ${customerName}`, `Email: ${email}`, `Phone: ${cleanText(body.phone, 40)}`, ...details, "", `Add this appointment to your calendar: ${calendarUrl}`].join("\n");
  const clientText = [`Hi ${firstName || "there"},`, "", "Thank you for booking with Autumn Nails. Your appointment is confirmed.", "", ...details, "", `Add this appointment to your calendar: ${calendarUrl}`, "", "We look forward to seeing you!", "", "Autumn Nails"].join("\n");
  const base = { from: { email: EMAIL_FROM, name: "Autumn Nails" }, replyTo: EMAIL_FROM };
  const sends = [env.EMAIL.send({ ...base, to: BUSINESS_EMAIL, subject: `New booking – ${customerName} – ${date}`, text: businessText }), env.EMAIL.send({ ...base, to: email, subject: "Your Autumn Nails appointment is confirmed", text: clientText })];
  const results = await Promise.allSettled(sends);
  results.forEach((result, index) => { if (result.status === "rejected") console.error(index === 0 ? "Business booking email failed:" : "Client booking email failed:", result.reason); });
}

function cleanText(value, max) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, max); }
function normaliseEmail(value) { return String(value || "").trim().toLowerCase().slice(0, 254); }
function formatAddons(value) {
  const names = { "nail-art": "Nail Art (per nail)", "nail-stamping": "Nail Stamping (per nail)", "nail-stamping-full-set": "Nail Stamping (full set, per colour)" };
  if (!value || typeof value !== "object") return [];
  return Object.entries(names).flatMap(([id, name]) => { const quantity = Math.floor(Math.max(0, Number(value[id] || 0))); return Number.isFinite(quantity) && quantity > 0 ? [`${name} × ${quantity}`] : []; });
}
function formatMoney(pence) { return `£${(Number(pence || 0) / 100).toFixed(2)}`; }
function formatDate(value) { return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(`${value}T12:00:00`)); }
function formatTime(value) { const [hour, minute] = String(value).split(":").map(Number); return `${String(hour % 12 || 12)}:${String(minute).padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`; }

function jsonResponse(data, response) { const headers = new Headers(response.headers); headers.delete("Content-Encoding"); headers.delete("Content-Length"); headers.set("Content-Type", "application/json; charset=utf-8"); return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers }); }
function corsJson(data, status, request) { const origin = request.headers.get("Origin") === "https://www.autumnnails.com" ? "https://www.autumnnails.com" : "https://autumnnails.com"; return new Response(JSON.stringify(data), { status, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" } }); }
