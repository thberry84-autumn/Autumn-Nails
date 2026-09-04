import studioWorker from "./index.js";

const HTML_INJECT = '<script src="/studio-actions.js" defer></script><script src="/studio-calendar.js" defer></script>';

export default {
  async fetch(request, env, ctx) {
    const response = await studioWorker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;
    const html = await response.text();
    return new Response(html.replace(/<\/body>/i, `${HTML_INJECT}</body>`), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
};
