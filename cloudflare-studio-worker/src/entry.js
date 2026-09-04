import studioWorker from "./index.js";

export default {
  async fetch(request, env, ctx) {
    const response = await studioWorker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    const calendarResponse = await env.ASSETS.fetch(new Request(new URL("/studio-calendar.js", request.url)));
    const calendarSource = calendarResponse.ok ? await calendarResponse.text() : "";
    const htmlInject = `<script src="/studio-actions.js" defer></script>${calendarSource ? `<script>${calendarSource}</script>` : ""}`;
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return new Response(html.replace(/<\/body>/i, `${htmlInject}</body>`), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
