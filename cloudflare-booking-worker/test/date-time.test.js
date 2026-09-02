import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index.js";

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

describe("public availability date/time handling", () => {
  it("does not expose a slot from a previous date", async () => {
    await insertSlot("2000-01-01", "18:00");
    const response = await request("/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    expect((await response.json()).slots).toHaveLength(0);
  });

  it("returns future dates", async () => {
    await insertSlot("2999-01-01", "18:00");
    const response = await request("/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    expect((await response.json()).slots).toHaveLength(1);
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
