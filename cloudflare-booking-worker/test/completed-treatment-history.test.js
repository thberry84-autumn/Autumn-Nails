import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-history.js";

const site = "https://autumnnails.com";

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return worker.fetch(new Request(site + path, { ...options, headers }), env);
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

describe("completed treatment history", () => {
  it("requires admin authentication", async () => {
    const response = await request("/api/admin/completed-treatment", {
      method: "POST",
      body: JSON.stringify({ clientId: "not-a-client", date: "01/09/2026", services: ["builder-full-set"] })
    });
    expect(response.status).toBe(401);
  });

  it("records a completed multi-treatment with addons, payment and notes", async () => {
    const token = await login();
    const clientResponse = await request("/api/admin/clients", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({ firstName: "History", surname: "Client", email: "history@example.com", phone: "07000000000" })
    });
    expect(clientResponse.status).toBe(201);
    const clientId = (await clientResponse.json()).client.id;

    const response = await request("/api/admin/completed-treatment", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({
        clientId,
        date: "01/09/2026",
        services: ["builder-gel-full-set", "express-gel-toes"],
        addons: { "nail-art": 4 },
        priceAdjustmentPence: -200,
        paymentStatus: "paid",
        notes: "Chipping on two nails at previous visit; repaired and discussed care."
      })
    });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.treatment.originalPricePence).toBe(5600);
    expect(data.treatment.finalPricePence).toBe(5400);
    expect(data.treatment.notes).toContain("Chipping");

    const history = await request(`/api/admin/clients/${clientId}/history`, { headers: { Authorization: "Bearer " + token } });
    expect(history.status).toBe(200);
    const historyData = await history.json();
    expect(historyData.history).toHaveLength(1);
    expect(historyData.history[0].source).toBe("Completed treatment added by admin");
    expect(historyData.history[0].notes).toContain("Chipping");
    expect(historyData.history[0].paymentStatus).toBe("paid");
  });

  it("counts an added completed full set for the 21-day infill rule", async () => {
    const token = await login();
    const clientResponse = await request("/api/admin/clients", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({ firstName: "Infill", surname: "Client", email: "infill@example.com", phone: "07000000000" })
    });
    const clientId = (await clientResponse.json()).client.id;

    const recorded = await request("/api/admin/completed-treatment", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify({ clientId, date: "01/09/2026", services: ["builder-full-set"], paymentStatus: "paid" })
    });
    expect(recorded.status).toBe(201);

    const slot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?) RETURNING id").bind("2099-09-15", "12:30", JSON.stringify(["builder-infill"]), "available", new Date().toISOString(), new Date().toISOString()).first();
    const booking = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({ slotId: slot.id, serviceId: "builder-infill", firstName: "Infill", surname: "Client", email: "infill@example.com", phone: "07000000000", marketingOptIn: false })
    });
    expect(booking.status).toBe(201);
    const data = await booking.json();
    expect(data.booking.infillChanged).toBe(false);
    expect(data.booking.service).toBe("Builder Infill");
    expect(data.booking.price).toBe(2500);
  });
});
