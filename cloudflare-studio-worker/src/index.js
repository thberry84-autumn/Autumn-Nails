const STUDIO_HOST = "studio.autumnnails.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") return Response.json({ ok: true, service: "autumn-nails-studio", host: STUDIO_HOST });

    const identity = await getStudioIdentity(request, ctx);
    if (url.pathname.startsWith("/api/studio/") && !identity?.email) return json({ error: "Studio authentication is required." }, 401);

    if (url.pathname === "/api/studio/finance" && request.method === "GET") {
      const result = await env.DB.prepare(`SELECT b.id,b.date,b.start_time,b.price_pence,b.price_adjustment_pence,b.final_price_pence,b.payment_status,b.status,c.first_name,c.surname,c.email FROM bookings b JOIN clients c ON c.id=b.client_id ORDER BY b.date DESC,b.start_time DESC`).all();
      const rows = result.results || [];
      const totals = rows.reduce((acc, row) => { const value = Number(row.final_price_pence ?? row.price_pence ?? 0); acc.booked += value; if (row.payment_status === "paid") acc.paid += value; if (row.payment_status === "unpaid") acc.unpaid += value; return acc; }, { booked: 0, paid: 0, unpaid: 0 });
      return json({ rows, totals }, 200);
    }

    if (url.pathname.startsWith("/api/studio/bookings/") && request.method === "PATCH") {
      const id = String(url.pathname.split("/").pop());
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid booking." }, 400);
      let body; try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
      const current = await env.DB.prepare("SELECT * FROM bookings WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return json({ error: "Booking not found." }, 404);
      const allowedPayment = new Set(["unpaid", "paid", "refunded", "not-required"]);
      const payment = body.paymentStatus == null ? current.payment_status : String(body.paymentStatus);
      if (!allowedPayment.has(payment)) return json({ error: "Invalid payment status." }, 400);
      const adjustment = body.priceAdjustmentPence == null ? Number(current.price_adjustment_pence || 0) : Math.round(Number(body.priceAdjustmentPence));
      if (!Number.isFinite(adjustment) || adjustment < -100000 || adjustment > 100000) return json({ error: "Invalid price adjustment." }, 400);
      const finalPrice = Math.max(0, Number(current.price_pence || 0) + adjustment), now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE bookings SET payment_status=?,price_adjustment_pence=?,final_price_pence=?,updated_at=? WHERE id=?").bind(payment, adjustment, finalPrice, now, id),
        env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, "studio_payment_amended", JSON.stringify({ paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice, by: identity.email }), now)
      ]);
      return json({ ok: true, paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice });
    }

    if (url.pathname === "/api/studio/clients" && request.method === "GET") return await studioClients(env);
    if (url.pathname === "/api/studio/clients" && request.method === "POST") return await studioCreateClient(request, env);
    if (url.pathname.startsWith("/api/studio/clients/") && url.pathname.endsWith("/history") && request.method === "GET") return await studioClientHistory(url, env);
    if (url.pathname.startsWith("/api/studio/clients/") && request.method === "PATCH") return await studioUpdateClient(url, request, env);

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
    const withoutLegacyFinanceLoad = withPublicHeaderBehaviour
      .replace("if(name==='finance')loadFinance()", "if(name==='finance')void 0")
      .replace("if(name==='clients')loadClients()", "if(name==='clients')void 0");
    const footer = `<footer><div class="wrap footer-grid"><div><a class="brand" href="https://autumnnails.com"><strong>Autumn</strong><span>Nails</span></a><div class="small" style="margin-top:10px">A calm little space for beautiful nails.</div><div class="small" style="margin-top:14px">Studio</div></div><div class="footer-links"><a href="https://autumnnails.com">Customer website</a><a href="https://autumnnails.com/services.html">Services &amp; Booking</a><a href="https://autumnnails.com/gallery.html">Gallery</a><a href="https://autumnnails.com/contact.html">Contact</a></div></div></footer>`;
    const styles = '<link rel="stylesheet" href="/studio.css?v=20260904i"><link rel="stylesheet" href="/studio-payment-amend.css?v=20260904b">';
    const scripts = '<script src="/studio-actions.js?v=20260904f"></script><script src="/studio-calendar.js?v=20260904f"></script><script src="/studio-booking-fixes.js?v=20260904f"></script><script src="/studio-finance.js?v=20260904f"></script><script src="/studio-clients.js?v=20260904c"></script><script>(function(){const clean=()=>document.querySelectorAll("style#studio-polish-css,style:not([id])").forEach(s=>{if(s.id==="studio-polish-css"||s.textContent.includes("#studioCalendar{"))s.remove()});new MutationObserver(clean).observe(document.head,{childList:true});clean()})();</script>';
    const finalHtml = withoutLegacyFinanceLoad.replace(/<\/head>/i, `${styles}</head>`).replace(/<\/body>/i, `${footer}${scripts}</body>`);
    const headers = new Headers(response.headers); headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return new Response(finalHtml, { status: response.status, statusText: response.statusText, headers });
  }
};

async function studioClients(env) {
  const result = await env.DB.prepare(`SELECT c.id,c.first_name,c.surname,c.email,c.phone,c.marketing_opt_in,c.created_at,c.updated_at,COUNT(b.id) AS booking_count,MAX(b.date) AS last_booking_date FROM clients c LEFT JOIN bookings b ON b.client_id=c.id GROUP BY c.id ORDER BY c.surname,c.first_name`).all();
  return json({ clients: result.results || [] });
}

async function studioCreateClient(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const firstName = cleanText(body.firstName,80), surname = cleanText(body.surname,80), email = normaliseEmail(body.email), phone = cleanText(body.phone,40);
  if (!firstName || !surname || !email || !phone) return json({ error: "Please complete all required client details." }, 400);
  const now = new Date().toISOString(), id = crypto.randomUUID();
  try { await env.DB.prepare("INSERT INTO clients (id,first_name,surname,email,phone,marketing_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id,firstName,surname,email,phone,body.marketingOptIn === true ? 1 : 0,now,now).run(); }
  catch (error) { if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error: "A client with that email address already exists." }, 409); throw error; }
  return json({ ok:true, id }, 201);
}

async function studioUpdateClient(url, request, env) {
  const id = decodeURIComponent(url.pathname.split("/").pop());
  if (!validId(id)) return json({ error: "Invalid client." }, 400);
  let body; try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const current = await env.DB.prepare("SELECT * FROM clients WHERE id=? LIMIT 1").bind(id).first();
  if (!current) return json({ error: "Client not found." }, 404);
  const firstName = cleanText(body.firstName ?? current.first_name,80), surname = cleanText(body.surname ?? current.surname,80), email = normaliseEmail(body.email ?? current.email), phone = cleanText(body.phone ?? current.phone,40);
  const marketing = body.marketingOptIn == null ? Number(current.marketing_opt_in || 0) : body.marketingOptIn === true ? 1 : 0;
  if (!firstName || !surname || !email || !phone) return json({ error: "Please complete all required client details." }, 400);
  try { await env.DB.prepare("UPDATE clients SET first_name=?,surname=?,email=?,phone=?,marketing_opt_in=?,updated_at=? WHERE id=?").bind(firstName,surname,email,phone,marketing,new Date().toISOString(),id).run(); }
  catch (error) { if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error: "A client with that email address already exists." }, 409); throw error; }
  return json({ ok:true });
}

async function studioClientHistory(url, env) {
  const parts = url.pathname.split("/");
  const id = decodeURIComponent(parts[4] || "");
  if (!validId(id)) return json({ error: "Invalid client." }, 400);
  const client = await env.DB.prepare("SELECT id,first_name,surname FROM clients WHERE id=? LIMIT 1").bind(id).first();
  if (!client) return json({ error: "Client not found." }, 404);
  const result = await env.DB.prepare(`SELECT b.id,b.date,b.start_time,b.service_id,b.booked_service_id,b.selected_services_json,b.addons_json,b.price_pence,b.price_adjustment_pence,b.final_price_pence,b.payment_status,b.status,b.created_at,(SELECT e.metadata_json FROM booking_events e WHERE e.booking_id=b.id AND e.event_type IN ('completed_treatment_added','completed_treatment_updated') ORDER BY e.created_at DESC LIMIT 1) AS history_metadata FROM bookings b WHERE b.client_id=? ORDER BY b.date DESC,b.start_time DESC`).bind(id).all();
  return json({ client, history:(result.results||[]).map(row=>({ ...row, metadata:parseJson(row.history_metadata,{}) })) });
}

function cleanText(value,max){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max)}
function normaliseEmail(value){return String(value||'').trim().toLowerCase().slice(0,254)}
function validId(value){return /^[0-9a-f-]{36}$/i.test(String(value))}
function parseJson(value,fallback){try{const parsed=JSON.parse(value??'');return parsed??fallback}catch{return fallback}}

async function getStudioIdentity(request, ctx) {
  if (ctx?.access) { const identity = await ctx.access.getIdentity(); if (identity?.email) return identity; }
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || request.headers.get("CF-Access-Authenticated-User-Email");
  return email ? { email } : null;
}

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" } }); }
