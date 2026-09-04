import studioWorker from "./index.js";

export default {
  async fetch(request, env, ctx) {
    const response = await studioWorker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    const calendarResponse = await env.ASSETS.fetch(new Request(new URL("/studio-calendar.js", request.url)));
    const calendarSource = calendarResponse.ok ? await calendarResponse.text() : "";
    const calendarShell = `<section id="studioCalendar" class="studio-calendar-shell"></section>`;
    const htmlInject = `${calendarSource ? `<script>${calendarSource}</script>` : ""}`;
    const withCalendar = html.replace(/<div class="grid" style="margin-bottom:18px">/i, `${calendarShell}<div class="grid" style="margin-bottom:18px">`);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return new Response(withCalendar.replace(/<\/body>/i, `${htmlInject}</body>`), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};