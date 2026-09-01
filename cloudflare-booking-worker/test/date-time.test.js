import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const ORIGIN = "https://autumnnails.com";

async function request(env, path) {
  return worker.fetch(new Request(`https://autumn-nails-booking.thberry84.workers.dev${path}`, { headers: { Origin: ORIGIN } }), env);
}

describe("public availability date/time handling", () => {
  it("does not expose a slot from a previous date", async ({ env }) => {
    await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (date('now','-1 day'),'18:00','[\\\"builder-full-set\\\"]','available',datetime('now'),datetime('now'))").run();
    const response = await request(env, "/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots).toHaveLength(0);
  });

  it("returns future dates", async ({ env }) => {
    await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (date('now','+1 day'),'18:00','[\\\"builder-full-set\\\"]','available',datetime('now'),datetime('now'))").run();
    const response = await request(env, "/api/availability?service=builder-full-set");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots).toHaveLength(1);
  });
});
