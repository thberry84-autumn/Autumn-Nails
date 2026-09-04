import studioWorker from "./index.js";
import { handleStudioAction } from "./studio-actions.js";
import { handleBookingStatusUpdate } from "./booking-status.js";
import { handleAvailabilityEdit } from "./availability-edit.js";
import { handleStudioMutation } from "./studio-mutations.js";
import { handlePaymentAmend } from "./payment-amend.js";

const STUDIO_ORIGIN = "https://studio.autumnnails.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = STUDIO_ORIGIN;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    if (request.method === "GET" && url.pathname === "/api/availability") {
      try {
        await requireAccess(ctx);
        const result = await env.DB.prepare("SELECT id,date,start_time,service_ids_json,status,created_at,updated_at FROM availability_slots WHERE removed_at IS NULL ORDER BY date,start_time").all();
        return json({ slots: (result.results || []).map(row => ({ ...row, serviceIds: parseJson(row.service_ids_json, []) })) }, 200, origin);
      } catch (error) {
        if (error?.status) return json({ error: error.message }, error.status, origin);
        console.error(error);
        return json({ error: "Something went wrong. Please try again." }, 500, origin);
      }
    }

    if (request.method === "POST" && (url.pathname.startsWith("/api/availability/") || url.pathname.startsWith("/api/bookings/"))) {
      try {
        const response = await handleStudioMutation(request, env, ctx, origin, url.pathname);
        if (response) return response;
      } catch (error) {
        console.error("Studio mutation failed", error);
        if (error?.status) return json({ error: error.message }, error.status, origin);
        return json({ error: `Studio mutation failed: ${String(error?.message || error)}` }, 500, origin);
      }
    }
    if (request.method === "PATCH" && url.pathname.startsWith("/api/bookings/") && url.pathname.endsWith("/payment")) {
      try {
        const response = await handlePaymentAmend(request, env, ctx, origin, url.pathname);
        if (response) return response;
      } catch (error) {
        if (error?.status) return json({ error: error.message }, error.status, origin);
        console.error(error);
        return json({ error: "Could not save the payment amendment. Please try again." }, 500, origin);
      }
    }
    if (request.method === "PATCH" && url.pathname.startsWith("/api/bookings/")) {
      try {
        const response = await handleBookingStatusUpdate(request, env, ctx, origin, url.pathname);
        if (response) return response;
      } catch (error) {
        if (error?.status) return json({ error: error.message }, error.status, origin);
        console.error(error);
        return json({ error: "Something went wrong. Please try again." }, 500, origin);
      }
    }
    if (request.method === "PATCH" && url.pathname.startsWith("/api/availability/")) {
      try {
        const response = await handleAvailabilityEdit(request, env, ctx, origin, url.pathname);
        if (response) return response;
      } catch (error) {
        if (error?.status) return json({ error: error.message }, error.status, origin);
        console.error(error);
        return json({ error: "Something went wrong. Please try again." }, 500, origin);
      }
    }
    if (url.pathname === "/api/manual-booking" || url.pathname === "/api/completed-treatment" || url.pathname.startsWith("/api/completed-treatment/")) {
      try {
        const response = await handleStudioAction(request, env, ctx, origin, url.pathname);
        if (response) return response;
      } catch (error) {
        if (error?.status) return json({ error: error.message }, error.status, origin);
        console.error(error);
        return json({ error: "Something went wrong. Please try again." }, 500, origin);
      }
    }
    return studioWorker.fetch(request, env, ctx);
  }
};

async function requireAccess(ctx) {
  if (!ctx?.access) throw httpError(401, "Studio authentication is required.");
  const identity = await ctx.access.getIdentity();
  if (!identity?.email) throw httpError(403, "Studio identity could not be verified.");
  return identity;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cors(origin){return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,PUT,DELETE,OPTIONS","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store"};}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});}
