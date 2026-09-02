import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-duration.js";

const site = "https://autumnnails.com";

function futureDate(days) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
