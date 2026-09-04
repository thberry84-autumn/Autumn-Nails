import studioWorker from "./index.js";

const HTML_INJECT = '<script src="/studio-actions.js" defer></script><script src="/studio-calendar.js?v=20260904" defer></script>';

export default {
  async fetch(request, env, ctx) {
    const response = await studioWorker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return new Response(html.replace(/<\/body>/i, `${HTML_INJECT}</body>`), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
