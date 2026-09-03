import bookingWorker from "./index-duration.js";
import { durationForServices } from "./duration-config.js";

const SITE_ORIGINS = new Set(["https://autumnnails.com", "https://www.autumnnails.com"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const originHeader = request.headers.get("Origin");
    const origin = SITE_ORIGINS.has(originHeader) ? originHeader : "https://autumnnails.com";
    let existingMarketingConsent = null;
    let existingClientId = null;

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    if (request.method === "POST" && url.pathname === "/api/book") {
      try {
        const body = await request.clone().json();
        const slotId = Number(body.slotId);
        const email = normaliseEmail(body.email);
        if (email) {
          const client = await env.DB.prepare("SELECT id, marketing_opt_in FROM clients WHERE email=? LIMIT 1").bind(email).first();
          if (client) {
            existingClientId = client.id;
            existingMarketingConsent = Number(client.marketing_opt_in) === 1;
          }
        }
        if (Number.isInteger(slotId) && slotId > 0) {
          const slot = await env.DB.prepare("SELECT date,start_time,status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(slotId).first();
          if (slot && slot.status === "available" && !slot.removed_at && isPastLondonSlot(slot.date, slot.start_time)) {
            return json({ error: "That appointment time has already passed. Please choose another time." }, 409, origin);
          }
        }
      } catch {
        // Preserve the existing booking worker's validation for malformed JSON/input.
      }
    }

    const response = await bookingWorker.fetch(request, env, ctx);

    // Keep the private admin booking list aligned with the real service duration.
    if (request.method === "GET" && url.pathname === "/api/admin/bookings" && response.ok) {
      try {
        const data = await response.clone().json();
        if (Array.isArray(data.bookings)) {
          data.bookings = data.bookings.map(booking => {
            const serviceIds = serviceIdsForAdminBooking(booking);
            const duration = durationForServices(serviceIds);
            return {
              ...booking,
              durationMinutes: duration,
              end_time: addMinutesToTime(booking.start_time, duration)
            };
          });
          return json(data, response.status, origin);
        }
      } catch {
        // If the response is not JSON, return it unchanged.
      }
    }

    // A normal booking with marketingOptIn=false is not an explicit withdrawal of
    // previously granted consent. Preserve an existing opt-in until an explicit
    // unsubscribe/withdrawal mechanism is provided.
    if (request.method === "POST" && url.pathname === "/api/book" && response.status === 201 && existingMarketingConsent && existingClientId) {
      try {
        await env.DB.prepare("UPDATE clients SET marketing_opt_in = 1 WHERE id = ?").bind(existingClientId).run();
      } catch {
        // Do not turn a successful booking into a failed booking if the consent
        // preservation write cannot be completed.
      }
    }

    if (request.method === "GET" && url.pathname === "/api/availability" && response.ok) {
      try {
        const data = await response.clone().json();
        if (Array.isArray(data.slots)) {
          data.slots = data.slots.filter(slot => !isPastLondonSlot(slot.date, slot.start_time));
          return json(data, response.status, origin);
        }
      } catch {
        // If the response is not JSON, return it unchanged.
      }
    }

    return response;
  }
};

function serviceIdsForAdminBooking(booking) {
  if (Array.isArray(booking.selected_services)) {
    const ids = booking.selected_services.map(item => typeof item === "string" ? item : item?.id).filter(Boolean);
    if (ids.length) return ids;
  }
  if (typeof booking.selected_services_json === "string") {
    try {
      const items = JSON.parse(booking.selected_services_json);
      const ids = Array.isArray(items) ? items.map(item => typeof item === "string" ? item : item?.id).filter(Boolean) : [];
      if (ids.length) return ids;
    } catch {}
  }
  if (booking.booked_service_id) return [String(booking.booked_service_id)];
  if (booking.service_id) return [String(booking.service_id)];
  const nameToId = {
    "Basic Manicure": "basic-manicure",
    "Gel Polish": "gel-polish",
    "Builder Full Set": "builder-full-set",
    "Builder Infill": "builder-infill",
    "Builder & Gel Polish Full Set": "builder-gel-full-set",
    "Builder & Gel Polish Infill": "builder-gel-infill",
    "Acrylic – Full Set": "acrylic-full-set",
    "Express Gel Toes": "express-gel-toes"
  };
  const names = String(booking.bookedService || "").split(" + ").map(value => value.trim()).filter(Boolean);
  return names.map(name => nameToId[name]).filter(Boolean);
}

export function isPastLondonSlot(date, startTime, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{2}:\d{2}$/.test(String(startTime || ""))) return false;
  const nowParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const current = Object.fromEntries(nowParts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const today = `${current.year}-${current.month}-${current.day}`;
  if (date < today) return true;
  if (date > today) return false;
  const [hour, minute] = startTime.split(":").map(Number);
  return hour * 60 + minute <= Number(current.hour) * 60 + Number(current.minute);
}

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function addMinutesToTime(time, minutes) {
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  const total = hour * 60 + minute + Number(minutes || 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
