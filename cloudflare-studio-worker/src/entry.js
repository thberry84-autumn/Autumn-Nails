import studioWorker from "./index.js";

const HTML_INJECT = `<script src="/studio-actions.js" defer></script><script src="/studio-calendar.js?v=20260904" defer></script><script>(function(){function boot(){if(location.hash!=="#bookings")return;var s=document.getElementById("studioCalendar");if(s)return;var el=document.querySelector("#bookings");if(!el){setTimeout(boot,100);return}var existing=document.querySelector('script[data-studio-calendar-loader]');if(existing)return;var x=document.createElement("script");x.src="/studio-calendar.js?v=20260904&boot="+Date.now();x.dataset.studioCalendarLoader="1";x.onload=function(){setTimeout(function(){if(!document.getElementById("studioCalendar"))boot()},100)};x.onerror=function(){setTimeout(boot,500)};document.body.appendChild(x)}window.addEventListener("hashchange",boot);if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();setTimeout(boot,250);setTimeout(boot,1000)})();</script>`;

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
