import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-v2.js";

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

async function json(response) { return response.json(); }

async function createSlot({ date, time = "18:00", serviceIds = [] }) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(date, time, JSON.stringify(serviceIds), "available", now, now).run();
  return result.meta.last_row_id;
}

async function createClient({ id = crypto.randomUUID(), email = "test@example.com" } = {}) {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO clients (id,first_name,surname,email,phone,marketing_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, "Test", "Client", email, "07123456789", 0, now, now).run();
  return id;
}

async function createCompletedBooking({ clientId, serviceId, date }) {
  const slotId = await createSlot({ date, serviceIds: [serviceId] });
  const bookingId = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(bookingId, slotId, clientId, serviceId, serviceId, date, "18:00", 2800, "{}", "completed", now, now).run();
  return bookingId;
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM booking_events"), env.DB.prepare("DELETE FROM bookings"), env.DB.prepare("DELETE FROM availability_slots"), env.DB.prepare("DELETE FROM clients"), env.DB.prepare("DELETE FROM settings")]);
});

describe("public booking API", () => {
  it("returns the server-owned service prices", async () => {
    const response = await request("/api/services");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.services.find(s => s.id === "builder-infill").price).toBe(2500);
    expect(body.services.find(s => s.id === "builder-gel-infill").price).toBe(2700);
    expect(body.services.find(s => s.id === "builder-full-set").price).toBe(2800);
    expect(body.services.find(s => s.id === "builder-gel-full-set").price).toBe(3000);
  });

  it("recognises a returning customer by case-insensitive email", async () => {
    const firstSlot = await createSlot({ date: futureDate(10), serviceIds: ["builder-full-set"] });
    const first = await request("/api/book", { method: "POST", body: JSON.stringify({ slotId: firstSlot, serviceId: "builder-full-set", firstName: "Jane", surname: "Smith", email: "Jane@example.com", phone: "07123456789", marketingOptIn: true }) });
    expect(first.status).toBe(201);
    expect((await json(first)).booking.clientReturning).toBe(false);
    const secondSlot = await createSlot({ date: futureDate(20), serviceIds: ["gel-polish"] });
    const second = await request("/api/book", { method: "POST", body: JSON.stringify({ slotId: secondSlot, serviceId: "gel-polish", firstName: "Jane", surname: "Smith", email: "JANE@EXAMPLE.COM", phone: "07123456789", marketingOptIn: true }) });
    expect(second.status).toBe(201);
    expect((await json(second)).booking.clientReturning).toBe(true);
    const clients = await env.DB.prepare("SELECT id,email FROM clients").all();
    expect(clients.results).toHaveLength(1);
    expect(clients.results[0].email).toBe("jane@example.com");
  });

  it("uses the 2-hour appointment duration in the booking response", async () => {
    const date = futureDate(12);
    const slotId = await createSlot({ date, time: "18:00", serviceIds: ["gel-polish"] });
    const response = await request("/api/book", { method: "POST", body: JSON.stringify({ slotId, serviceId: "gel-polish", firstName: "Jane", surname: "Smith", email: "jane@example.com", phone: "07123456789" }) });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.booking.startTime).toBe("18:00");
    expect(body.booking.endTime).toBe("20:00");
    expect(body.booking.durationMinutes).toBe(120);
  });

  it("can rebook a slot after its previous booking was cancelled", async () => {
    const slotId = await createSlot({ date: futureDate(12), serviceIds: ["gel-polish"] });
    const firstPayload = { slotId, serviceId: "gel-polish", firstName: "Jane", surname: "Smith", email: "jane@example.com", phone: "07123456789", marketingOptIn: false };
    const first = await request("/api/book", { method: "POST", body: JSON.stringify(firstPayload) });
    expect(first.status).toBe(201);
    const firstBooking = (await json(first)).booking;

    await env.DB.batch([
      env.DB.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").bind(firstBooking.id),
      env.DB.prepare("UPDATE availability_slots SET status='available' WHERE id=?").bind(slotId)
    ]);

    const second = await request("/api/book", { method: "POST", body: JSON.stringify({ ...firstPayload, email: "another@example.com" }) });
    expect(second.status).toBe(201);
    expect((await env.DB.prepare("SELECT id,status FROM bookings WHERE slot_id=? ORDER BY created_at").bind(slotId).all()).results).toHaveLength(2);
  });

  it("cannot book the same slot twice", async () => {
    const slotId = await createSlot({ date: futureDate(12), serviceIds: ["gel-polish"] });
    const payload = { slotId, serviceId: "gel-polish", firstName: "Jane", surname: "Smith", email: "jane@example.com", phone: "07123456789", marketingOptIn: false };
    expect((await request("/api/book", { method: "POST", body: JSON.stringify(payload) })).status).toBe(201);
    const second = await request("/api/book", { method: "POST", body: JSON.stringify({ ...payload, email: "another@example.com" }) });
    expect(second.status).toBe(409);
    expect((await env.DB.prepare("SELECT id FROM bookings").all()).results).toHaveLength(1);
  });

  it("calculates add-ons on the server", async () => {
    const slotId = await createSlot({ date: futureDate(14), serviceIds: ["builder-full-set"] });
    const response = await request("/api/book", { method: "POST", body: JSON.stringify({ slotId, serviceId: "builder-full-set", firstName: "Jane", surname: "Smith", email: "jane@example.com", phone: "07123456789", addons: { "nail-art": 1 } }) });
    expect(response.status).toBe(201);
    expect((await json(response)).booking.price).toBe(2900);
  });
});

describe.each([["builder-infill", "builder-full-set", 2500, 2800], ["builder-gel-infill", "builder-gel-full-set", 2700, 3000]])("%s pricing", (infillService, qualifyingService, infillPrice, fullSetPrice) => {
  it.each([20, 21])("uses infill price at %i days", async days => {
    const clientId = await createClient({ email: "returning@example.com" });
    const bookingDate = futureDate(30), previousDate = futureDate(30 - days);
    await createCompletedBooking({ clientId, serviceId: qualifyingService, date: previousDate });
    const slotId = await createSlot({ date: bookingDate, serviceIds: [infillService] });
    const response = await request("/api/book", { method: "POST", body: JSON.stringify({ slotId, serviceId: infillService, firstName: "Returning", surname: "Client", email: "returning@example.com", phone: "07123456789" }) });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.booking.price).toBe(infillPrice);
    expect(body.booking.infillChanged).toBe(false);
  });

  it("uses full-set price after 3 weeks", async () => {
    const clientId = await createClient({ email: "returning@example.com" });
    const bookingDate = futureDate(30);
    await createCompletedBooking({ clientId, serviceId: qualifyingService, date: futureDate(8) });
    const slotId = await createSlot({ date: bookingDate, serviceIds: [infillService] });
    const response = await request("/api/book", { method: "POST", body: JSON.stringify({ slotId, serviceId: infillService, firstName: "Returning", surname: "Client", email: "returning@example.com", phone: "07123456789" }) });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.booking.price).toBe(fullSetPrice);
    expect(body.booking.infillChanged).toBe(true);
  });

  it("does not use a cancelled previous appointment to qualify", async () => {
    const clientId = await createClient({ email: "returning@example.com" }), previousDate = futureDate(9), now = new Date().toISOString();
    const slotId = await createSlot({ date: previousDate, serviceIds: [qualifyingService] });
    await env.DB.prepare("INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), slotId, clientId, qualifyingService, qualifyingService, previousDate, "18:00", fullSetPrice, "{}", "cancelled", now, now).run();
    const newSlot = await createSlot({ date: futureDate(30), serviceIds: [infillService] });
    const response = await request("/api/book", { method: "POST", body: JSON.stringify({ slotId: newSlot, serviceId: infillService, firstName: "Returning", surname: "Client", email: "returning@example.com", phone: "07123456789" }) });
    expect(response.status).toBe(201);
    expect((await json(response)).booking.price).toBe(fullSetPrice);
  });
});

describe("admin authentication", () => {
  it("rejects unauthenticated admin requests", async () => {
    expect((await request("/api/admin/bookings")).status).toBe(401);
  });

  it("accepts configured credentials and rejects bad credentials", async () => {
    const bad = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@example.test", password: "wrong" }) });
    expect(bad.status).toBe(401);
    const good = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@example.test", password: "test-password-only" }) });
    expect(good.status).toBe(200);
    const body = await json(good);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect((await request("/api/admin/bookings", { headers: { Authorization: `Bearer ${body.token}` } })).status).toBe(200);
  });

  it("throttles repeated failed login attempts", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@example.test", password: "wrong" }) });
      expect(response.status).toBe(401);
    }
    const blocked = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@example.test", password: "wrong" }) });
    expect(blocked.status).toBe(429);
  });

  it("removes an available slot with booking history without deleting the history", async () => {
    const slotId = await createSlot({ date: futureDate(15), serviceIds: ["gel-polish"] });
    const bookingId = crypto.randomUUID(), clientId = await createClient({ email: "history@example.com" }), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(bookingId, slotId, clientId, "gel-polish", "gel-polish", futureDate(15), "18:00", 2200, "{}", "cancelled", now, now).run();
    const login = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@example.test", password: "test-password-only" }) });
    expect(login.status).toBe(200);
    const token = (await json(login)).token;
    const response = await request(`/api/admin/availability/${slotId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect((await env.DB.prepare("SELECT status,removed_at FROM availability_slots WHERE id=?").bind(slotId).first()).removed_at).toBeTruthy();
    expect((await env.DB.prepare("SELECT status FROM bookings WHERE id=?").bind(bookingId).first()).status).toBe("cancelled");
  });
});

describe("security headers", () => {
  it("returns baseline browser security headers", async () => {
    const response = await request("/health");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
  });
});
