import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-v2.js";

const site = "https://autumnnails.com";

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env);
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

describe("direct booking expiry protection", () => {
  it("rejects a slot whose start time has already passed today", async () => {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map(({ type, value }) => [type, value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const slotId = (await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(date, "00:01", JSON.stringify(["builder-full-set"]), "available", now.toISOString(), now.toISOString()).run()).meta.last_row_id;

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({ slotId, serviceId: "builder-full-set", firstName: "Expired", surname: "Test", email: "expired@example.com", phone: "07123456789" })
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/passed/i);
    const slot = await env.DB.prepare("SELECT status FROM availability_slots WHERE id = ?").bind(slotId).first();
    expect(slot.status).toBe("available");
  });
});
