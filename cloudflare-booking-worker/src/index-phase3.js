import emailWorker from "./index-email.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/admin/availability" && request.headers.get("Authorization")) {
      try {
        const body = await request.clone().json();
        const date = String(body.date || "").trim();
        const startTime = String(body.startTime || "").trim();
        if (isValidDate(date) && isValidTime(startTime) && isPastLondonSlot(date, startTime)) {
          const origin = request.headers.get("Origin") === "https://www.autumnnails.com" ? "https://www.autumnnails.com" : "https://autumnnails.com";
          return new Response(JSON.stringify({ error: "That appointment time has already passed. Please choose a future date and time." }), {
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Credentials": "true",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
              "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
              "Vary": "Origin",
              "Cache-Control": "no-store"
            }
          });
        }
      } catch {
        // Let the underlying worker handle malformed requests consistently.
      }
    }

    return emailWorker.fetch(request, env, ctx);
  }
};

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function londonNowParts() {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
}

function isPastLondonSlot(date, time) {
  const now = londonNowParts();
  const current = `${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}`;
  return `${date}T${time}` <= current;
}
