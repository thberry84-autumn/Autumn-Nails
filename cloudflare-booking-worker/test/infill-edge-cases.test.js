import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index.js";

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
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env);
}

async function createSlot({ date, serviceId }) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(date, "18:00", JSON.stringify([serviceId]), "available", now, now).run();
  return result.meta.last_row_id;
}

async function createClient(email) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO clients (id,first_name,surname,email,phone,marketing_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(id, "Test", "Client", email, "07123456789", 0, now, now).run();
  return id;
}

async function createBookingRecord({ clientId, serviceId, date, status = "completed" }) {
  const slotId = await createSlot({ date, serviceId });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(id, slotId, clientId, serviceId, serviceId, date, "18:00", 2800, "{}", status, now, now).run();
  return id;
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM booking_events"),
    env.DB.prepare("DELETE FROM bookings"),
    env.DB.prepare("DELETE FROM availability_slots"),
    env.DB.prepare("DELETE FROM clients"),
    env.DB.prepare("DELETE FROM settings"),
  ]);
});

describe("returning customer and infill edge cases", () => {
  it("uses a manually recorded completed appointment to qualify for an infill", async () => {
    const email = "manual@example.com";
    const clientId = await createClient(email);
    const bookingDate = futureDate(30);
    await createBookingRecord({ clientId, serviceId: "builder-full-set", date: futureDate(10) });
    const slotId = await createSlot({ date: bookingDate, serviceId: "builder-infill" });

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId,
        serviceId: "builder-infill",
        firstName: "Manual",
        surname: "Client",
        email,
        phone: "07123456789",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.booking.infillChanged).toBe(false);
    expect(body.booking.price).toBe(2500);
  });

  it("falls back to full-set pricing when no qualifying completed appointment exists", async () => {
    const email = "no-history@example.com";
    await createClient(email);
    const slotId = await createSlot({ date: futureDate(30), serviceId: "builder-infill" });

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId,
        serviceId: "builder-infill",
        firstName: "No",
        surname: "History",
        email,
        phone: "07123456789",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.booking.infillChanged).toBe(true);
    expect(body.booking.price).toBe(2800);
    expect(body.booking.service).toBe("Builder Full Set");
  });

  it("uses the most recent qualifying completed appointment", async () => {
    const email = "latest@example.com";
    const clientId = await createClient(email);
    const bookingDate = futureDate(30);
    await createBookingRecord({ clientId, serviceId: "builder-full-set", date: futureDate(2) });
    await createBookingRecord({ clientId, serviceId: "builder-full-set", date: futureDate(10), status: "completed" });
    const slotId = await createSlot({ date: bookingDate, serviceId: "builder-infill" });

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId,
        serviceId: "builder-infill",
        firstName: "Latest",
        surname: "Client",
        email,
        phone: "07123456789",
      }),
    });

    expect(response.status).toBe(201);
    expect((await response.json()).booking.price).toBe(2500);
  });
});
