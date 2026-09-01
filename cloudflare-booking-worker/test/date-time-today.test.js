import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const ORIGIN = "https://autumnnails.com";
const BASE = "https://autumn-nails-booking.thberry84.workers.dev";

async function request(env, path) {
  return worker.fetch(new Request(`${BASE}${path}`, { headers: { Origin: ORIGIN } }), env);
}

async function insertSlot(env, date, time) {
  await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?, ?, ?, 'available', datetime('now'), datetime('now'))")
    .bind(date, time, JSON.stringify(["builder-full-set"]))
    .run();
}

describe("today availability boundary", () => {
  it("filters an appointment earlier today using Europe/London time", async ({ env }) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Math.max(0, Number(parts.hour) - 1);
    await insertSlot(env, date, `${String(hour).padStart(2, "0")}:${parts.minute}`);
    const response = await request(env, "/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    expect((await response.json()).slots).toHaveLength(0);
  });
});
