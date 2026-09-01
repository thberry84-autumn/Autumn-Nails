import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index.js";

const site = "https://autumnnails.com";

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env);
}

async function login() {
  const response = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@example.test", password: "test-password-only" }),
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
    env.DB.prepare("DELETE FROM settings"),
  ]);
});

describe("calendar security", () => {
  it("rejects an invalid calendar token", async () => {
    const response = await request("/calendar/not-a-real-token.ics");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("requires admin authentication to retrieve the calendar URL", async () => {
    const response = await request("/api/admin/calendar-token");
    expect(response.status).toBe(401);
  });

  it("rotating the calendar token invalidates the old token and issues a working new token", async () => {
    const auth = { Authorization: `Bearer ${await login()}` };
    const first = await request("/api/admin/calendar-token", { headers: auth });
    expect(first.status).toBe(200);
    const firstUrl = (await first.json()).url;
    const firstPath = new URL(firstUrl).pathname;

    const rotate = await request("/api/admin/calendar-token", { method: "POST", headers: auth });
    expect(rotate.status).toBe(200);
    const secondUrl = (await rotate.json()).url;
    const secondPath = new URL(secondUrl).pathname;
    expect(secondPath).not.toBe(firstPath);

    const oldFeed = await request(firstPath);
    expect(oldFeed.status).toBe(404);

    const newFeed = await request(secondPath);
    expect(newFeed.status).toBe(200);
    expect(newFeed.headers.get("Cache-Control")).toBe("no-store");
  });
});
