const STUDIO_HOST = "studio.autumnnails.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") return Response.json({ ok: true, service: "autumn-nails-studio", host: STUDIO_HOST });

    return env.ASSETS.fetch(request);
  }
};
