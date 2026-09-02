import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-phase3.js";

const site = "https://autumnnails.com";

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env);
}

async function login() {
  const response = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@example.test", password: "test-password-only" })
  });
  expect(response.status).toBe(200);
  return (await response.json()).token;
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

describe("Phase 3 admin availability guard", () => {
  it("still requires authentication", async () => {
    const response = await request("/api/admin/availability", {
      method: "POST",
      body: JSON.stringify({ date: "2000-01-01", startTime: "10:00", serviceIds: [] })
    });
    expect(response.status).toBe(401);
  });

  it("rejects a past slot before it can be released", async () => {
    const token = await login();
    const response = await request("/api/admin/availability", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: "2000-01-01", startTime: "10:00", serviceIds: [] })
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/passed/i);
    expect((await env.DB.prepare("SELECT id FROM availability_slots").all()).results).toHaveLength(0);
  });

  it("allows a future slot to be released", async () => {
    const token = await login();
    const response = await request("/api/admin/availability", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: "2999-01-01", startTime: "10:00", serviceIds: [] })
    });
    expect(response.status).toBe(200);
    const rows = (await env.DB.prepare("SELECT date,start_time,status FROM availability_slots").all()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2999-01-01", start_time: "10:00", status: "available" });
  });
});
