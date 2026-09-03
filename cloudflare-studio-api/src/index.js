const STUDIO_ORIGIN = "https://studio.autumnnails.com";
const GITHUB_API = "https://api.github.com";
const REPO = "thberry84-autumn/Autumn-Nails";
const GALLERY_PATH = "images/nails";
const CAPTIONS_FILE = `${GALLERY_PATH}/captions.json`;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SERVICES = [
  { id: "basic-manicure", name: "Basic Manicure", price: 1500 },
  { id: "gel-polish", name: "Gel Polish", price: 2200 },
  { id: "builder-full-set", name: "Builder Full Set", price: 2800 },
  { id: "builder-infill", name: "Builder Infill", price: 2500, infillDays: 21, fallbackId: "builder-full-set" },
  { id: "builder-gel-full-set", name: "Builder & Gel Polish Full Set", price: 3000 },
  { id: "builder-gel-infill", name: "Builder & Gel Polish Infill", price: 2700, infillDays: 21, fallbackId: "builder-gel-full-set" },
  { id: "acrylic-full-set", name: "Acrylic – Full Set", price: 3500 },
  { id: "express-gel-toes", name: "Express Gel Toes", price: 2200 }
];
const ADDONS = [
  { id: "nail-art", name: "Nail Art (per nail)", price: 100 },
  { id: "nail-stamping", name: "Nail Stamping (per nail)", price: 100 },
  { id: "nail-stamping-full-set", name: "Nail Stamping (full set, per colour)", price: 600 }
];
const SERVICE_BY_ID = new Map(SERVICES.map(s => [s.id, s]));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") === STUDIO_ORIGIN ? STUDIO_ORIGIN : STUDIO_ORIGIN;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    try {
      const identity = await requireAccess(ctx, origin);
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "autumn-nails-studio-api" }, 200, origin);
      if (url.pathname === "/api/me" && request.method === "GET") return json({ email: identity.email || null, name: identity.name || null }, 200, origin);
      if (url.pathname === "/api/services" && request.method === "GET") return json({ services: SERVICES, addons: ADDONS }, 200, origin, { "Cache-Control": "no-store" });

      if (url.pathname === "/api/availability" && request.method === "GET") return await availability(env, origin);
      if (url.pathname === "/api/availability" && request.method === "POST") return await addAvailability(request, env, origin);
      if (url.pathname.startsWith("/api/availability/") && request.method === "DELETE") return await deleteAvailability(url, env, origin);

      if (url.pathname === "/api/bookings" && request.method === "GET") return await bookings(env, origin);
      if (url.pathname.startsWith("/api/bookings/") && request.method === "PATCH") return await updateBooking(url, request, env, origin);

      if (url.pathname === "/api/clients" && request.method === "GET") return await clients(env, origin);
      if (url.pathname === "/api/clients" && request.method === "POST") return await createClient(request, env, origin);
      if (url.pathname.startsWith("/api/clients/") && request.method === "PATCH") return await updateClient(url, request, env, origin);
      if (url.pathname.startsWith("/api/clients/") && url.pathname.endsWith("/history") && request.method === "GET") return await clientHistory(url, env, origin);

      if (url.pathname === "/api/marketing" && request.method === "GET") return await marketing(env, origin);
      if (url.pathname === "/api/finance" && request.method === "GET") return await finance(env, origin);

      if (url.pathname === "/api/gallery" && request.method === "GET") return json({ files: await listGallery(env) }, 200, origin, { "Cache-Control": "no-store" });
      if (url.pathname === "/api/gallery" && request.method === "POST") return await uploadGallery(request, env, origin);
      if (url.pathname === "/api/gallery/metadata" && request.method === "PUT") return await updateGalleryMetadata(request, env, origin);
      if (url.pathname.startsWith("/api/gallery/") && request.method === "DELETE") return await deleteGallery(url, env, origin);

      return json({ error: "Not found" }, 404, origin);
    } catch (error) {
      if (error?.status) return json({ error: error.message }, error.status, origin);
      console.error(error);
      return json({ error: "Something went wrong. Please try again." }, 500, origin);
    }
  }
};

async function requireAccess(ctx, origin) {
  if (!ctx?.access) throw httpError(401, "Studio authentication is required.");
  const identity = await ctx.access.getIdentity();
  if (!identity?.email) throw httpError(403, "Studio identity could not be verified.");
  return identity;
}

async function availability(env, origin) {
  const result = await env.DB.prepare("SELECT id,date,start_time,service_ids_json,status,created_at,updated_at FROM availability_slots ORDER BY date,start_time").all();
  return json({ slots: (result.results || []).map(row => ({ ...row, serviceIds: parseJson(row.service_ids_json, []) })) }, 200, origin, { "Cache-Control": "no-store" });
}

async function addAvailability(request, env, origin) {
  const body = await request.json();
  const date = cleanDate(body.date), startTime = cleanTime(body.startTime);
  const serviceIds = Array.isArray(body.serviceIds) ? [...new Set(body.serviceIds.map(String).filter(id => SERVICE_BY_ID.has(id)))] : [];
  if (!date || !startTime) return json({ error: "Please provide a date and time." }, 400, origin);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,'available',?,?)").bind(date,startTime,JSON.stringify(serviceIds),now,now).run();
    return json({ ok: true, id: result.meta.last_row_id }, 201, origin);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error: "That appointment space already exists." }, 409, origin);
    throw error;
  }
}

async function deleteAvailability(url, env, origin) {
  const id = Number(url.pathname.split("/").pop());
  if (!Number.isInteger(id)) return json({ error: "Invalid appointment space." }, 400, origin);
  const row = await env.DB.prepare("SELECT status FROM availability_slots WHERE id=? LIMIT 1").bind(id).first();
  if (!row) return json({ error: "Appointment space not found." }, 404, origin);
  if (row.status === "booked") return json({ error: "A booked appointment space cannot be removed. Cancel the booking instead." }, 409, origin);
  await env.DB.prepare("DELETE FROM availability_slots WHERE id=?").bind(id).run();
  return json({ ok: true }, 200, origin);
}

async function bookings(env, origin) {
  const result = await env.DB.prepare(`SELECT b.id,b.date,b.start_time,b.service_id,b.booked_service_id,b.selected_services_json,b.addons_json,b.price_pence,b.price_adjustment_pence,b.final_price_pence,b.payment_status,b.status,b.created_at,b.updated_at,c.id AS client_id,c.first_name,c.surname,c.email,c.phone FROM bookings b JOIN clients c ON c.id=b.client_id ORDER BY b.date DESC,b.start_time DESC`).all();
  return json({ bookings: (result.results || []).map(row => ({ ...row, selectedServices: parseJson(row.selected_services_json, []), addons: parseJson(row.addons_json, {}), finalPricePence: Number(row.final_price_pence ?? row.price_pence ?? 0), priceAdjustmentPence: Number(row.price_adjustment_pence || 0) })) }, 200, origin, { "Cache-Control": "no-store" });
}

async function updateBooking(url, request, env, origin) {
  const id = String(url.pathname.split("/").pop());
  const body = await request.json();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid booking." }, 400, origin);
  const current = await env.DB.prepare("SELECT * FROM bookings WHERE id=? LIMIT 1").bind(id).first();
  if (!current) return json({ error: "Booking not found." }, 404, origin);
  const allowedStatus = new Set(["confirmed","completed","cancelled"]);
  const allowedPayment = new Set(["unpaid","paid","refunded","not-required"]);
  const status = body.status == null ? current.status : String(body.status);
  const payment = body.paymentStatus == null ? current.payment_status : String(body.paymentStatus);
  if (!allowedStatus.has(status)) return json({ error: "Invalid booking status." }, 400, origin);
  if (!allowedPayment.has(payment)) return json({ error: "Invalid payment status." }, 400, origin);
  const adjustment = body.priceAdjustmentPence == null ? Number(current.price_adjustment_pence || 0) : Math.round(Number(body.priceAdjustmentPence));
  if (!Number.isFinite(adjustment)) return json({ error: "Invalid price adjustment." }, 400, origin);
  const finalPrice = Math.max(0, Number(current.price_pence || 0) + adjustment);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE bookings SET status=?,payment_status=?,price_adjustment_pence=?,final_price_pence=?,updated_at=? WHERE id=?").bind(status,payment,adjustment,finalPrice,now,id),
    env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,"studio_booking_updated",JSON.stringify({ status, paymentStatus: payment, priceAdjustmentPence: adjustment, finalPricePence: finalPrice }),now)
  ]);
  return json({ ok: true }, 200, origin);
}

async function clients(env, origin) {
  const result = await env.DB.prepare(`SELECT c.id,c.first_name,c.surname,c.email,c.phone,c.marketing_opt_in,c.created_at,c.updated_at,COUNT(b.id) AS booking_count,MAX(b.date) AS last_booking_date FROM clients c LEFT JOIN bookings b ON b.client_id=c.id GROUP BY c.id ORDER BY c.surname,c.first_name`).all();
  return json({ clients: result.results || [] }, 200, origin, { "Cache-Control": "no-store" });
}

async function createClient(request, env, origin) {
  const body = await request.json();
  const firstName = cleanText(body.firstName,80), surname = cleanText(body.surname,80), email = normaliseEmail(body.email), phone = cleanText(body.phone,40);
  if (!firstName || !surname || !email || !phone) return json({ error: "Please complete all required client details." }, 400, origin);
  const now = new Date().toISOString();
  try {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO clients (id,first_name,surname,email,phone,marketing_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id,firstName,surname,email,phone,body.marketingOptIn === true ? 1 : 0,now,now).run();
    return json({ ok: true, id }, 201, origin);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error: "A client with that email address already exists." }, 409, origin);
    throw error;
  }
}

async function updateClient(url, request, env, origin) {
  const id = decodeURIComponent(url.pathname.split("/").pop());
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid client." }, 400, origin);
  const body = await request.json();
  const current = await env.DB.prepare("SELECT * FROM clients WHERE id=? LIMIT 1").bind(id).first();
  if (!current) return json({ error: "Client not found." }, 404, origin);
  const firstName = cleanText(body.firstName ?? current.first_name,80), surname = cleanText(body.surname ?? current.surname,80), email = normaliseEmail(body.email ?? current.email), phone = cleanText(body.phone ?? current.phone,40);
  const marketing = body.marketingOptIn == null ? Number(current.marketing_opt_in || 0) : body.marketingOptIn === true ? 1 : 0;
  if (!firstName || !surname || !email || !phone) return json({ error: "Please complete all required client details." }, 400, origin);
  await env.DB.prepare("UPDATE clients SET first_name=?,surname=?,email=?,phone=?,marketing_opt_in=?,updated_at=? WHERE id=?").bind(firstName,surname,email,phone,marketing,new Date().toISOString(),id).run();
  return json({ ok: true }, 200, origin);
}

async function clientHistory(url, env, origin) {
  const id = decodeURIComponent(url.pathname.split("/")[3] || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid client." }, 400, origin);
  const client = await env.DB.prepare("SELECT id,first_name,surname FROM clients WHERE id=? LIMIT 1").bind(id).first();
  if (!client) return json({ error: "Client not found." }, 404, origin);
  const result = await env.DB.prepare(`SELECT b.id,b.date,b.start_time,b.service_id,b.booked_service_id,b.selected_services_json,b.addons_json,b.price_pence,b.price_adjustment_pence,b.final_price_pence,b.payment_status,b.status,b.created_at,(SELECT e.metadata_json FROM booking_events e WHERE e.booking_id=b.id AND e.event_type IN ('completed_treatment_added','completed_treatment_updated') ORDER BY e.created_at DESC LIMIT 1) AS history_metadata FROM bookings b WHERE b.client_id=? ORDER BY b.date DESC,b.start_time DESC`).bind(id).all();
  return json({ client, history: (result.results || []).map(row => ({ ...row, selectedServices: parseJson(row.selected_services_json, []), addons: parseJson(row.addons_json, {}), metadata: parseJson(row.history_metadata, {}) })) }, 200, origin, { "Cache-Control": "no-store" });
}

async function marketing(env, origin) {
  const result = await env.DB.prepare("SELECT id,first_name,surname,email,phone,updated_at FROM clients WHERE marketing_opt_in=1 ORDER BY surname,first_name").all();
  return json({ contacts: result.results || [] }, 200, origin, { "Cache-Control": "no-store" });
}

async function finance(env, origin) {
  const result = await env.DB.prepare(`SELECT b.id,b.date,b.start_time,b.price_pence,b.price_adjustment_pence,b.final_price_pence,b.payment_status,b.status,c.first_name,c.surname,c.email FROM bookings b JOIN clients c ON c.id=b.client_id ORDER BY b.date DESC,b.start_time DESC`).all();
  const rows = result.results || [];
  const totals = rows.reduce((acc,row) => { const value = Number(row.final_price_pence ?? row.price_pence ?? 0); acc.booked += value; if (row.payment_status === "paid") acc.paid += value; if (row.payment_status === "unpaid") acc.unpaid += value; return acc; }, { booked:0, paid:0, unpaid:0 });
  return json({ rows, totals }, 200, origin, { "Cache-Control": "no-store" });
}

async function listGallery(env) {
  const captions = await getCaptions(env);
  const listed = await env.BUCKET.list({ limit: 1000 });
  const objects = listed.objects.filter(o => /\.(jpe?g|png|webp)$/i.test(o.key));
  const order = Array.isArray(captions._order) ? captions._order : [];
  const rank = new Map(order.map((name,index) => [name,index]));
  objects.sort((a,b) => (rank.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER) || b.key.localeCompare(a.key));
  const homepage = captions._homepage || objects[0]?.key || "";
  return objects.map((o,index) => ({ name:o.key, caption:captions[o.key] || "", position:index+1, homepage:o.key === homepage, url:`https://autumn-nails-upload.thberry84.workers.dev/images/${encodeURIComponent(o.key)}` }));
}

async function uploadGallery(request, env, origin) {
  const form = await request.formData();
  const files = form.getAll("files").filter(value => value instanceof File);
  if (!files.length) return json({ error: "No photos were selected." }, 400, origin);
  if (files.length > 20) return json({ error: "Please upload no more than 20 photos at once." }, 400, origin);
  let captions;
  try { captions = JSON.parse(String(form.get("captions") || "{}")); } catch { return json({ error: "The captions could not be read." }, 400, origin); }
  const metadata = await getCaptions(env);
  const order = Array.isArray(metadata._order) ? metadata._order.filter(Boolean) : [];
  const uploaded = [];
  for (let i=0;i<files.length;i++) {
    const file = files[i];
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return json({ error:`${file.name} is not a supported image type.` },400,origin);
    if (file.size > MAX_FILE_SIZE) return json({ error:`${file.name} is larger than 8 MB.` },400,origin);
    const filename = makeFilename(file.name);
    await env.BUCKET.put(filename,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:"public, max-age=31536000, immutable"}});
    metadata[filename] = String(captions[String(i)] || "").trim().slice(0,180);
    order.push(filename);
    uploaded.push({name:filename,caption:metadata[filename]});
  }
  metadata._order = unique(order);
  await saveCaptions(metadata,env,"Add nail gallery photos");
  return json({ok:true,uploaded},200,origin,{"Cache-Control":"no-store"});
}

async function updateGalleryMetadata(request, env, origin) {
  const body = await request.json();
  const metadata = await getCaptions(env);
  const listed = await env.BUCKET.list({limit:1000});
  const valid = new Set(listed.objects.filter(o => /\.(jpe?g|png|webp)$/i.test(o.key)).map(o => o.key));
  if (body.name && !valid.has(String(body.name))) return json({error:"Photo not found."},404,origin);
  if (body.name && Object.prototype.hasOwnProperty.call(body,"caption")) metadata[String(body.name)] = String(body.caption || "").trim().slice(0,180);
  if (Array.isArray(body.order)) metadata._order = unique(body.order.filter(v => typeof v === "string" && valid.has(v)));
  if (Object.prototype.hasOwnProperty.call(body,"homepage")) {
    const homepage = body.homepage == null ? "" : String(body.homepage);
    if (homepage && !valid.has(homepage)) return json({error:"Homepage photo not found."},404,origin);
    metadata._homepage = homepage;
  }
  await saveCaptions(metadata,env,"Update nail gallery settings");
  return json({ok:true,files:await listGallery(env)},200,origin,{"Cache-Control":"no-store"});
}

async function deleteGallery(url, env, origin) {
  const name = decodeURIComponent(url.pathname.slice("/api/gallery/".length));
  if (!/^[\\w .()\\-]+\\.(jpe?g|png|webp)$/i.test(name)) return json({error:"Invalid filename."},400,origin);
  if (!await env.BUCKET.head(name)) return json({error:"Photo not found."},404,origin);
  await env.BUCKET.delete(name);
  const metadata = await getCaptions(env);
  delete metadata[name];
  metadata._order = (Array.isArray(metadata._order) ? metadata._order : []).filter(v => v !== name);
  if (metadata._homepage === name) metadata._homepage = metadata._order[0] || "";
  await saveCaptions(metadata,env,"Delete nail gallery photo");
  return json({ok:true},200,origin,{"Cache-Control":"no-store"});
}

async function getCaptions(env) {
  const response = await githubRequest(`/repos/${REPO}/contents/${CAPTIONS_FILE}`,env.GITHUB_TOKEN);
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`GitHub captions request failed: ${response.status}`);
  const data = await response.json();
  try { const binary = atob(data.content.replace(/\n/g,"")); return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,c => c.charCodeAt(0)))); } catch { return {}; }
}

async function saveCaptions(metadata,env,message) {
  const current = await githubRequest(`/repos/${REPO}/contents/${CAPTIONS_FILE}`,env.GITHUB_TOKEN);
  const body = { message, content: toBase64(new TextEncoder().encode(JSON.stringify(metadata,null,2)+"\n") ) };
  if (current.ok) body.sha = (await current.json()).sha;
  const response = await githubRequest(`/repos/${REPO}/contents/${CAPTIONS_FILE}`,env.GITHUB_TOKEN,{method:"PUT",body:JSON.stringify(body)});
  if (!response.ok) throw new Error(`GitHub captions save failed: ${response.status}`);
}

async function githubRequest(path,token,options={}) { return fetch(`${GITHUB_API}${path}`,{...options,headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"X-GitHub-Api-Version":"2026-03-10","User-Agent":"Autumn-Nails-Studio-API",...(options.headers||{})}}); }
function makeFilename(original) { const extension = original.toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1] || "jpg"; const base = original.replace(/\.[^.]+$/," ").replace(/[^a-z0-9]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,50) || "nail-set"; const stamp = new Date().toISOString().replace(/[:.]/g,"-"); return `${stamp}-${crypto.randomUUID().slice(0,8)}-${base}.${extension}`; }
function parseJson(value,fallback) { try { const parsed = JSON.parse(value ?? ""); return parsed ?? fallback; } catch { return fallback; } }
function unique(values) { return [...new Set(values)]; }
function normaliseEmail(value) { return String(value || "").trim().toLowerCase().slice(0,254); }
function cleanText(value,max) { return String(value || "").trim().replace(/\s+/g," ").slice(0,max); }
function cleanDate(value) { const v=String(value || ""); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }
function cleanTime(value) { const v=String(value || ""); return /^\d{2}:\d{2}$/.test(v) ? v : ""; }
function toBase64(bytes) { let binary=""; for(let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(binary); }
function httpError(status,message) { const error = new Error(message); error.status = status; return error; }
function cors(origin) { return { "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,PUT,DELETE,OPTIONS","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store" }; }
function json(data,status,origin,extra={}) { return new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8",...extra}}); }
