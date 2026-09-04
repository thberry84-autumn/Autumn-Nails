const STUDIO_HOST = "studio.autumnnails.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // This Worker is intentionally not responsible for the public website.
    // Cloudflare Access will sit in front of this hostname at deployment time.
    // Static Studio pages are served from the Worker Assets collection.
    //
    // API proxying is deliberately not enabled in this first build step. The
    // booking worker still uses the existing admin session authentication on
    // main, so we will migrate the API boundary only after the Studio UI and
    // Access policy have been tested independently.
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "autumn-nails-studio", host: STUDIO_HOST });
    }

    return env.ASSETS.fetch(request);
  }
};
