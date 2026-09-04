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
    const withoutLegacyStyle = withCalendar.replace(/<style>[\s\S]*?<\/style>/i, "");
    const withPublicHeaderBehaviour = withoutLegacyStyle
      .replace('href="#home"><img', 'href="https://autumnnails.com"><img')
      .replace('</nav><div class="who"', '</nav><button class="menu" aria-label="Open menu" aria-controls="studioTopbar" onclick="document.getElementById(\'studioTopbar\').classList.toggle(\'open\')">☰</button><div class="who"')
      .replace('<header class="topbar">', '<header class="topbar" id="studioTopbar">');
    const footer = `<footer><div class="wrap footer-grid"><div><a class="brand" href="https://autumnnails.com"><strong>Autumn</strong><span>Nails</span></a><div class="small" style="margin-top:10px">A calm little space for beautiful nails.</div><div class="small" style="margin-top:14px">Studio</div></div><div class="footer-links"><a href="https://autumnnails.com">Customer website</a><a href="https://autumnnails.com/services.html">Services &amp; Booking</a><a href="https://autumnnails.com/gallery.html">Gallery</a><a href="https://autumnnails.com/contact.html">Contact</a></div></div></footer>`;
    const styles = '<link rel="stylesheet" href="/studio.css?v=20260904i">';
    const scripts = '<script src="/studio-actions.js?v=20260904f"></script><script src="/studio-calendar.js?v=20260904f"></script><script src="/studio-booking-fixes.js?v=20260904f"></script><script>(function(){const clean=()=>document.querySelectorAll("style#studio-polish-css,style:not([id])").forEach(s=>{if(s.id==="studio-polish-css"||s.textContent.includes("#studioCalendar{"))s.remove()});new MutationObserver(clean).observe(document.head,{childList:true});clean()})();</script>';
    const finalHtml = withPublicHeaderBehaviour.replace(/<\/head>/i, `${styles}</head>`).replace(/<\/body>/i, `${footer}${scripts}</body>`);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return new Response(finalHtml, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
