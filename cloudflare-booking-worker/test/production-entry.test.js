import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-production.js";

const site = "https://autumnnails.com";

function futureDate(days) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function londonDateParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Origin", site);
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env, {
    waitUntil() {}
  });
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM booking_events"),
    env.DB.prepare("DELETE FROM bookings"),
    env.DB.prepare("DELETE FROM availability_slots"),
    env.DB.prepare("DELETE FROM clients"),
    env.DB.prepare("DELETE FROM settings")
  ]);
});

describe("production Worker entrypoint", () => {
  it("returns parseable JSON with CORS and the booking calendar URL", async () => {
    const date = futureDate(12);
    const now = new Date().toISOString();
    const slot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(date, "18:00", JSON.stringify(["gel-polish"]), "available", now, now)
      .run();

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId: slot.meta.last_row_id,
        serviceId: "gel-polish",
        firstName: "Jane",
        surname: "Smith",
        email: "jane@example.com",
        phone: "07123456789",
        marketingOptIn: false,
        addons: {}
      })
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(site);
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/i);

    const body = await response.json();
    expect(body.booking.startTime).toBe("18:00");
    expect(body.booking.endTime).toBe("19:30");
    expect(body.booking.durationMinutes).toBe(90);
    expect(body.booking.calendarUrl).toContain(`/calendar/event/${body.booking.id}`);
  });

  it("preserves an existing returning customer's marketing opt-in", async () => {
    const date = futureDate(12);
    const now = new Date().toISOString();
    const clientId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO clients (id,first_name,surname,email,phone,marketing_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(clientId, "Jane", "Smith", "jane@example.com", "07123456789", 1, now, now)
      .run();
    const slot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(date, "18:00", JSON.stringify(["gel-polish"]), "available", now, now)
      .run();

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId: slot.meta.last_row_id,
        serviceId: "gel-polish",
        firstName: "Jane",
        surname: "Smith",
        email: "jane@example.com",
        phone: "07123456789",
        marketingOptIn: false,
        addons: {}
      })
    });

    expect(response.status).toBe(201);
    const client = await env.DB.prepare("SELECT marketing_opt_in FROM clients WHERE id = ?").bind(clientId).first();
    expect(Number(client.marketing_opt_in)).toBe(1);
  });

  it("rejects a direct booking for an earlier slot today", async () => {
    const nowParts = londonDateParts();
    const today = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
    const nowMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);
    const pastMinutes = Math.max(0, nowMinutes - 60);
    const pastTime = `${String(Math.floor(pastMinutes / 60)).padStart(2, "0")}:${String(pastMinutes % 60).padStart(2, "0")}`;
    const createdAt = new Date().toISOString();
    const slot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(today, pastTime, JSON.stringify(["gel-polish"]), "available", createdAt, createdAt)
      .run();

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId: slot.meta.last_row_id,
        serviceId: "gel-polish",
        firstName: "Jane",
        surname: "Smith",
        email: "jane@example.com",
        phone: "07123456789",
        marketingOptIn: false,
        addons: {}
      })
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "That appointment time has already passed. Please choose another time." });
    const bookingCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM bookings").first();
    expect(Number(bookingCount.count)).toBe(0);
  });

  it("filters earlier-today availability at the production entrypoint", async () => {
    const nowParts = londonDateParts();
    const today = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
    const nowMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);
    const pastMinutes = Math.max(0, nowMinutes - 60);
    const pastTime = `${String(Math.floor(pastMinutes / 60)).padStart(2, "0")}:${String(pastMinutes % 60).padStart(2, "0")}`;
    const futureMinutes = Math.min(23 * 60 + 59, nowMinutes + 60);
    const futureTime = `${String(Math.floor(futureMinutes / 60)).padStart(2, "0")}:${String(futureMinutes % 60).padStart(2, "0")}`;
    const createdAt = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(today, pastTime, JSON.stringify(["gel-polish"]), "available", createdAt, createdAt),
      env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(today, futureTime, JSON.stringify(["gel-polish"]), "available", createdAt, createdAt)
    ]);

    const response = await request(`/api/availability?service=gel-polish&date=${today}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots.some(slot => slot.start_time === pastTime)).toBe(false);
  });

  it("allows only one booking on a weekday, regardless of client", async () => {
    const date = futureDate(12);
    const now = new Date().toISOString();
    const firstSlot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(date, "18:00", JSON.stringify(["gel-polish"]), "available", now, now)
      .run();
    const secondSlot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(date, "20:00", JSON.stringify(["gel-polish"]), "available", now, now)
      .run();

    const first = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId: firstSlot.meta.last_row_id,
        serviceId: "gel-polish",
        firstName: "Jane",
        surname: "Smith",
        email: "jane@example.com",
        phone: "07123456789",
        marketingOptIn: false,
        addons: {}
      })
    });
    expect(first.status).toBe(201);

    const second = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId: secondSlot.meta.last_row_id,
        serviceId: "gel-polish",
        firstName: "Sarah",
        surname: "Jones",
        email: "sarah@example.com",
        phone: "07987654321",
        marketingOptIn: false,
        addons: {}
      })
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "That weekday is already fully booked. Please choose another day." });
  });
});
