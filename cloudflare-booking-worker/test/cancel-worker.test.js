import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-cancel.js";

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
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env, { waitUntil() {} });
}

async function seedBooking({ date = futureDate(14), startTime = "18:00" } = {}) {
  const now = new Date().toISOString();
  const clientId = crypto.randomUUID();
  const slot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .bind(date, startTime, JSON.stringify(["gel-polish"]), "booked", now, now).run();
  const bookingId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO clients (id,first_name,surname,email,phone,marketing_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(clientId, "Jane", "Smith", "jane@example.com", "07123456789", 0, now, now).run();
  await env.DB.prepare("INSERT INTO bookings (id,client_id,slot_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(bookingId, clientId, slot.meta.last_row_id, "gel-polish", "gel-polish", date, startTime, 0, "{}", "confirmed", now, now).run();
  return { bookingId, date, startTime, slotId: slot.meta.last_row_id };
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM booking_events"),
    env.DB.prepare("DELETE FROM bookings"),
    env.DB.prepare("DELETE FROM availability_slots"),
    env.DB.prepare("DELETE FROM clients")
  ]);
});

describe("customer cancellation", () => {
  it("cancels a future appointment and reopens its slot", async () => {
    const booking = await seedBooking();
    const response = await request("/api/cancel", {
      method: "POST",
      body: JSON.stringify({ email: "JANE@EXAMPLE.COM", phone: "07123 456789", date: booking.date, startTime: booking.startTime })
    });
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    const saved = await env.DB.prepare("SELECT status FROM bookings WHERE id=?").bind(booking.bookingId).first();
    const slot = await env.DB.prepare("SELECT status FROM availability_slots WHERE id=?").bind(booking.slotId).first();
    const event = await env.DB.prepare("SELECT event_type,metadata_json FROM booking_events WHERE booking_id=? ORDER BY created_at DESC LIMIT 1").bind(booking.bookingId).first();
    expect(saved.status).toBe("cancelled");
    expect(slot.status).toBe("available");
    expect(event.event_type).toBe("cancelled");
    expect(JSON.parse(event.metadata_json).source).toBe("customer");
  });

  it("does not reveal whether an appointment exists when details are wrong", async () => {
    const booking = await seedBooking();
    const response = await request("/api/cancel", {
      method: "POST",
      body: JSON.stringify({ email: "wrong@example.com", phone: "07123456789", date: booking.date, startTime: booking.startTime })
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("couldn't verify");
    const saved = await env.DB.prepare("SELECT status FROM bookings WHERE id=?").bind(booking.bookingId).first();
    expect(saved.status).toBe("confirmed");
  });

  it("rejects a second cancellation without changing the slot again", async () => {
    const booking = await seedBooking();
    const body = { email: "jane@example.com", phone: "07123456789", date: booking.date, startTime: booking.startTime };
    expect((await request("/api/cancel", { method: "POST", body: JSON.stringify(body) })).status).toBe(200);
    const second = await request("/api/cancel", { method: "POST", body: JSON.stringify(body) });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toContain("already been cancelled");
  });
});
