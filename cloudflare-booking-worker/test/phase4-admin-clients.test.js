import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-snagging.js";

const site = "https://autumnnails.com";
function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env);
}
async function login() {
  const response = await request("/api/login", { method: "POST", body: JSON.stringify({ email: "admin@example.test", password: "test-password-only" }) });
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
}

describe("Phase 4 client admin", () => {
  it("requires authentication for client creation", async () => {
    const response = await request("/api/admin/clients", { method: "POST", body: JSON.stringify({ firstName: "Test", surname: "Client", email: "test@example.com", phone: "07000000000" }) });
    expect(response.status).toBe(401);
  });

  it("creates a client and normalises the email", async () => {
    const token = await login();
    const response = await request("/api/admin/clients", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ firstName: "Test", surname: "Client", email: " TEST@Example.com ", phone: "07000000000", marketingOptIn: true }) });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.client).toMatchObject({ firstName: "Test", surname: "Client", email: "test@example.com", phone: "07000000000", marketingOptIn: true });
  });

  it("prevents duplicate email addresses", async () => {
    const token = await login();
    const body = { firstName: "Test", surname: "Client", email: "test@example.com", phone: "07000000000" };
    expect((await request("/api/admin/clients", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).status).toBe(201);
    const response = await request("/api/admin/clients", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...body, firstName: "Another" }) });
    expect(response.status).toBe(409);
  });

  it("amends an existing client", async () => {
    const token = await login();
    const created = await request("/api/admin/clients", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ firstName: "Test", surname: "Client", email: "test@example.com", phone: "07000000000", marketingOptIn: false }) });
    const id = (await created.json()).client.id;
    const response = await request(`/api/admin/clients/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ firstName: "Updated", surname: "Name", email: "updated@example.com", phone: "07111111111", marketingOptIn: true }) });
    expect(response.status).toBe(200);
    expect((await response.json()).client).toMatchObject({ id, firstName: "Updated", surname: "Name", email: "updated@example.com", phone: "07111111111", marketingOptIn: true });
  });
});
