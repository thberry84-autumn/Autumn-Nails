import studioWorker from "./index.js";
import { handleStudioAction } from "./studio-actions.js";

const STUDIO_ORIGIN = "https://studio.autumnnails.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = STUDIO_ORIGIN;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
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

function cors(origin){return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store"};}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});}