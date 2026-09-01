import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index.js";

const site = "https://autumnnails.com";

function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return worker.fetch(new Request(`${site}${path}`, { ...options, headers }), env);
}

function londonParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).map(({ type, value }) => [type, value]));
}

async function createSlot(date, time) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(date, time, JSON.stringify(["builder-full-set"]), "available", now, now).run();
  return result.meta.last_row_id;
}

describe("booking API expiry protection", () => {
  it("rejects a slot earlier today even when submitted directly", async () => {
    const parts = londonParts();
    const currentHour = Number(parts.hour);
    if (currentHour === 0) return;

    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const pastTime = `${String(currentHour - 1).padStart(2, "0")}:${parts.minute}`;
    const slotId = await createSlot(date, pastTime);

    const response = await request("/api/book", {
      method: "POST",
      body: JSON.stringify({
        slotId,
        serviceId: "builder-full-set",
        firstName: "Expired",
        surname: "Slot",
        email: "expired@example.com",
        phone: "07123456789",
      }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/passed/i);

    const slot = await env.DB.prepare("SELECT status FROM availability_slots WHERE id = ?").bind(slotId).first();
    expect(slot.status).toBe("available");
  });
});
