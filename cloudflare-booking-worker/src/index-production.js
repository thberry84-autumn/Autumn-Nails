import bookingWorker from "./index-duration.js";

const SITE_ORIGINS = new Set(["https://autumnnails.com", "https://www.autumnnails.com"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const originHeader = request.headers.get("Origin");
    const origin = SITE_ORIGINS.has(originHeader) ? originHeader : "https://autumnnails.com";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    if (request.method === "POST" && url.pathname === "/api/book") {
      try {
        const body = await request.clone().json();
        const slotId = Number(body.slotId);
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
