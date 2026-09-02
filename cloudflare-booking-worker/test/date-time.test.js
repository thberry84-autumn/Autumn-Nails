import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index-v2.js";

const site = "https://autumnnails.com";

function request(path) {
  return worker.fetch(new Request(`${site}${path}`), env);
}

async function insertSlot(date, time) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(date, time, JSON.stringify(["builder-full-set"]), "available", now, now).run();
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

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM booking_events"),
    env.DB.prepare("DELETE FROM bookings"),
    env.DB.prepare("DELETE FROM availability_slots"),
    env.DB.prepare("DELETE FROM clients"),
    env.DB.prepare("DELETE FROM settings"),
  ]);
});

describe("public availability date/time handling", () => {
  it("does not expose a slot from a previous date", async () => {
    await insertSlot("2000-01-01", "18:00");
    const response = await request("/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    expect((await response.json()).slots).toHaveLength(0);
  });

  it("returns future dates with the 2-hour duration", async () => {
    await insertSlot("2999-01-01", "18:00");
    const response = await request("/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    const slots = (await response.json()).slots;
    expect(slots).toHaveLength(1);
    expect(slots[0].start_time).toBe("18:00");
    expect(slots[0].endTime).toBe("20:00");
    expect(slots[0].durationMinutes).toBe(120);
  });

  it("does not expose an appointment earlier today in London time", async () => {
    const parts = londonParts();
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const currentHour = Number(parts.hour);
    if (currentHour === 0) return;
    const pastTime = `${String(currentHour - 1).padStart(2, "0")}:${parts.minute}`;
    await insertSlot(date, pastTime);
    const response = await request("/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    expect((await response.json()).slots.some(slot => slot.start_time === pastTime)).toBe(false);
  });
});
