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
    const calendarResponse = await env.ASSETS.fetch(new Request(new URL("/studio-calendar.js", request.url)));
    const calendarSource = calendarResponse.ok ? await calendarResponse.text() : "";
    const calendarShell = `<section id="studioCalendar" class="studio-calendar-shell"></section>`;
    const injected = html.replace(/<div class="grid" style="margin-bottom:18px">/i, `${calendarShell}<div class="grid" style="margin-bottom:18px">`);
    const finalHtml = calendarSource ? injected.replace(/<\/body>/i, `<script>${calendarSource}</script></body>`) : injected;
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return new Response(finalHtml, { status: response.status, statusText: response.statusText, headers });
  }
};
