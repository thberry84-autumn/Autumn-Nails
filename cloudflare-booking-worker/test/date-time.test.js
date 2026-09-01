import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index.js";

const site = "https://autumnnails.com";

async function request(path) {
  return worker.fetch(new Request(`${site}${path}`), env);
}

async function insertSlot(date, time) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(date, time, JSON.stringify(["builder-full-set"]), "available", now, now).run();
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
});
