const STUDIO_HOST = "studio.autumnnails.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") return Response.json({ ok: true, service: "autumn-nails-studio", host: STUDIO_HOST });

    const identity = await getStudioIdentity(request, ctx);
    if (url.pathname.startsWith("/api/") && !identity?.email) return json({ error: "Studio authentication is required." }, 401);

    return env.ASSETS.fetch(request);
  }
};

async function getStudioIdentity(request, ctx) {
  if (ctx?.access) { const identity = await ctx.access.getIdentity(); if (identity?.email) return identity; }
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || request.headers.get("CF-Access-Authenticated-User-Email");
  return email ? { email } : null;
}

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" } }); }
