const STUDIO_HOST = "studio.autumnnails.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "autumn-nails-studio", host: STUDIO_HOST });
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    const calendarMount = '<section id="studioCalendar" class="studio-calendar-shell" aria-label="Weekly calendar"></section>';
    const withCalendar = html.replace(/<section class="panel"><div class="kicker">Calendar<\/div><h2>Private calendar<\/h2>[\s\S]*?<\/section><\/div>/, `${calendarMount}</div>`);

    // The Studio page has historically carried its own inline visual shell. Strip it here so
    // there is one authoritative visual system rather than stacked CSS overrides.
    const withoutLegacyStyle = withCalendar.replace(/<style>[\s\S]*?<\/style>/i, "");
    const styles = '<link rel="stylesheet" href="/studio.css?v=20260904f">';
    const scripts = '<script src="/studio-actions.js?v=20260904f"></script><script src="/studio-calendar.js?v=20260904f"></script><script src="/studio-booking-fixes.js?v=20260904f"></script>';
    const finalHtml = withoutLegacyStyle.replace(/<\/head>/i, `${styles}</head>`).replace(/<\/body>/i, `${scripts}</body>`);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return new Response(finalHtml, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
