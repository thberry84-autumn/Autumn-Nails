const STUDIO_HOST = "studio.autumnnails.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "autumn-nails-studio", host: STUDIO_HOST });
    }

    // Payment amendments are handled on the same Studio origin. This avoids
    // Safari/CORS preflight problems when the Access-protected Studio calls
    // the separately protected booking API directly from the browser.
    if (url.pathname.startsWith("/api/studio/bookings/") && request.method === "PATCH") {
      if (!ctx?.access) return json({ error: "Studio authentication is required." }, 401);
      const identity = await ctx.access.getIdentity();
      if (!identity?.email) return json({ error: "Studio identity could not be verified." }, 403);

      const id = String(url.pathname.split("/").pop());
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid booking." }, 400);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid request body." }, 400);
      }

      const current = await env.DB.prepare("SELECT * FROM bookings WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return json({ error: "Booking not found." }, 404);

      const allowedPayment = new Set(["unpaid", "paid", "refunded", "not-required"]);
      const payment = body.paymentStatus == null ? current.payment_status : String(body.paymentStatus);
      if (!allowedPayment.has(payment)) return json({ error: "Invalid payment status." }, 400);

      const adjustment = body.priceAdjustmentPence == null
        ? Number(current.price_adjustment_pence || 0)
        : Math.round(Number(body.priceAdjustmentPence));
      if (!Number.isFinite(adjustment) || adjustment < -100000 || adjustment > 100000) {
        return json({ error: "Invalid price adjustment." }, 400);
      }

      const finalPrice = Math.max(0, Number(current.price_pence || 0) + adjustment);
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE bookings SET payment_status=?,price_adjustment_pence=?,final_price_pence=?,updated_at=? WHERE id=?")
          .bind(payment, adjustment, finalPrice, now, id),
        env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, "studio_payment_amended", JSON.stringify({ paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice, by: identity.email }), now)
      ]);

      return json({ ok: true, paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice });
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
    const styles = '<link rel="stylesheet" href="/studio.css?v=20260904i"><link rel="stylesheet" href="/studio-payment-amend.css?v=20260904b">';
    const scripts = '<script src="/studio-actions.js?v=20260904f"></script><script src="/studio-calendar.js?v=20260904f"></script><script src="/studio-booking-fixes.js?v=20260904f"></script><script src="/studio-finance.js?v=20260904c"></script><script>(function(){const clean=()=>document.querySelectorAll("style#studio-polish-css,style:not([id])").forEach(s=>{if(s.id==="studio-polish-css"||s.textContent.includes("#studioCalendar{"))s.remove()});new MutationObserver(clean).observe(document.head,{childList:true});clean()})();</script>';
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
