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
    const styles = '<link rel="stylesheet" href="/studio-customer-theme.css?v=20260904d">' + '<style id="studio-customer-theme-inline">:root{--oat:#EFE5D8;--espresso:#4B2F26;--orange:#C46A2B;--sage:#9EAE9C;--peach:#F3C7B6;--cream:#FFFDF9;--ink-soft:#70574E;--line:rgba(75,47,38,.14);--shadow:0 24px 70px rgba(75,47,38,.12);--shadow-soft:0 14px 35px rgba(75,47,38,.07);--radius-md:24px;--radius-pill:999px}body{color:var(--espresso);background:radial-gradient(circle at 12% 8%,rgba(243,199,182,.42),transparent 30%),linear-gradient(135deg,var(--oat),#faf3eb 52%,#f4e3d8);font-family:ui-rounded,"Nunito Sans","Avenir Next","Segoe UI",sans-serif;font-size:1.08rem;line-height:1.65}.wrap{width:min(1120px,calc(100% - 32px));padding:0 0 70px}.topbar{position:sticky;top:16px;margin-top:16px;padding:12px 14px 12px 24px;border:1px solid rgba(255,255,255,.86);border-radius:999px;background:rgba(255,253,249,.92);box-shadow:0 16px 38px rgba(75,47,38,.10);backdrop-filter:blur(14px);gap:22px}.brand{width:225px;height:105px}.brand img{width:220px;height:100px}.nav{gap:24px;font-size:.74rem;letter-spacing:.14em}.nav a{padding:0;border-radius:0;background:none!important}.nav a:hover,.nav a:focus-visible,.nav a.active{background:none!important;color:var(--orange)}.who{font-size:.72rem;color:#80675e}.logout{min-height:44px;border:1px solid var(--line);background:rgba(255,255,255,.38);color:var(--espresso);border-radius:999px;padding:12px 18px;font-size:.72rem;text-transform:uppercase;letter-spacing:.14em}.hero{padding:72px 0 46px}.hero h1{font-family:Georgia,serif;font-weight:400;letter-spacing:-.05em;font-size:clamp(3.6rem,7vw,6.2rem);line-height:.88;margin:18px 0 20px}.hero h1 em{color:var(--orange)}.hero p,.muted{color:var(--ink-soft);font-size:1.08rem;line-height:1.8}.kicker{color:var(--orange);font-size:.76rem;letter-spacing:.24em}.grid{gap:18px}.card,.panel{padding:30px;border:1px solid var(--line);border-radius:24px;background:rgba(255,255,255,.46);box-shadow:var(--shadow-soft)}.card h2,.panel h2{font:400 1.65rem Georgia,serif}.button{min-height:48px;border-radius:999px;padding:14px 22px;background:var(--espresso);font-size:.74rem;font-weight:700;letter-spacing:.14em}.button.secondary{border:1px solid var(--line);background:rgba(255,255,255,.38);color:var(--espresso);box-shadow:none}.field label{font-size:.74rem;letter-spacing:.14em;color:#80675e}.field input,.field select,.field textarea{border:1px solid var(--line);border-radius:14px;padding:13px;background:rgba(255,255,255,.72);color:var(--espresso)}table{background:rgba(255,255,255,.62)}th{font-size:.68rem;letter-spacing:.14em;color:#80675e}td{font-size:.92rem}.tag,.badge{padding:6px 10px;border-radius:999px;background:#f3e2d7;color:#80584d;font-size:.72rem;letter-spacing:.08em}.stats{gap:18px}.stat{background:rgba(255,255,255,.46);border:1px solid var(--line);border-radius:24px;padding:20px;box-shadow:var(--shadow-soft)}.stat small{color:#80675e}.stat strong{font:400 1.8rem Georgia,serif}#studioCalendar{background:rgba(255,255,255,.46)!important;border:1px solid var(--line)!important;box-shadow:var(--shadow-soft)!important;border-radius:24px!important;padding:30px!important}@media(max-width:800px){.topbar{top:10px;margin-top:10px;height:100px;padding:8px 10px 8px 16px;gap:10px}.brand{width:225px;height:84px}.brand img{width:220px;height:84px}.nav{display:none}.topbar.open .nav{display:flex;position:absolute;top:calc(100% + 10px);left:0;right:0;flex-direction:column;gap:14px;padding:18px;border:1px solid rgba(255,255,255,.86);border-radius:22px;background:var(--cream);box-shadow:var(--shadow)}.hero{padding:44px 0 30px}.hero h1{font-size:clamp(3.15rem,13vw,4.8rem)}.grid{grid-template-columns:1fr}.card,.panel{padding:26px}}</style>';
    const scripts = '<script src="/studio-actions.js?v=20260904d"></script><script src="/studio-calendar.js?v=20260904d"></script><script src="/studio-calendar-layout.js?v=20260904d"></script><script src="/studio-booking-fixes.js?v=20260904d"></script>';
    const finalHtml = withCalendar.replace(/<\/head>/i, `${styles}</head>`).replace(/<\/body>/i, `${scripts}</body>`);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return new Response(finalHtml, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
