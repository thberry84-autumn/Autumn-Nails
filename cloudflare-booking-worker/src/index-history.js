import bookingWorker from "./index-multi-calendar.js";

const SERVICES = {
  "basic-manicure": ["Basic Manicure", 1500],
  "gel-polish": ["Gel Polish", 2200],
  "builder-full-set": ["Builder Full Set", 2800],
  "builder-infill": ["Builder Infill", 2500],
  "builder-gel-full-set": ["Builder & Gel Polish Full Set", 3000],
  "builder-gel-infill": ["Builder & Gel Polish Infill", 2700],
  "acrylic-full-set": ["Acrylic – Full Set", 3500],
  "express-gel-toes": ["Express Gel Toes", 2200]
};
const ADDONS = {
  "nail-art": ["Nail Art (per nail)", 100],
  "nail-stamping": ["Nail Stamping (per nail)", 100],
  "nail-stamping-full-set": ["Nail Stamping (full set, per colour)", 600]
};
const SITE_ORIGINS = new Set(["https://autumnnails.com", "https://www.autumnnails.com"]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const originHeader = request.headers.get("Origin");
    const origin = SITE_ORIGINS.has(originHeader) ? originHeader : "https://autumnnails.com";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    try {
      if (request.method === "GET" && url.pathname.startsWith("/api/admin/clients/") && url.pathname.endsWith("/history")) {
        const id = decodeURIComponent(url.pathname.split("/")[4] || "");
        return admin(request, env, origin, () => clientHistory(id, env, origin));
      }
      if (request.method === "POST" && url.pathname === "/api/admin/completed-treatment") return admin(request, env, origin, () => addCompletedTreatment(request, env, origin));
      if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/completed-treatment/")) {
        const id = decodeURIComponent(url.pathname.split("/")[4] || "");
        return admin(request, env, origin, () => updateCompletedTreatment(id, request, env, origin));
      }
      return bookingWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error(error);
      return json({ error: "Something went wrong. Please try again." }, 500, origin);
    }
  }
};

async function clientHistory(clientId, env, origin) {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return json({ error: "Client not found." }, 404, origin);
  const client = await env.DB.prepare("SELECT id,first_name,surname FROM clients WHERE id=? LIMIT 1").bind(clientId).first();
  if (!client) return json({ error: "Client not found." }, 404, origin);
  const result = await env.DB.prepare(`SELECT b.id,b.date,b.start_time,b.service_id,b.booked_service_id,b.selected_services_json,b.addons_json,b.price_pence,b.price_adjustment_pence,b.final_price_pence,b.payment_status,b.status,b.created_at,(SELECT metadata_json FROM booking_events e WHERE e.booking_id=b.id AND e.event_type IN ('completed_treatment_added','completed_treatment_updated') ORDER BY e.created_at DESC LIMIT 1) AS history_metadata,(SELECT event_type FROM booking_events e WHERE e.booking_id=b.id AND e.event_type IN ('completed_treatment_added','completed_treatment_updated') ORDER BY e.created_at DESC LIMIT 1) AS history_event FROM bookings b WHERE b.client_id=? ORDER BY b.date DESC,b.start_time DESC,b.created_at DESC`).bind(clientId).all();
  const history = (result.results || []).map(row => {
    const items = parseJson(row.selected_services_json, []);
    const metadata = parseJson(row.history_metadata, {});
    const serviceItems = items.length ? items : [{ id: row.booked_service_id || row.service_id, name: serviceName(row.booked_service_id || row.service_id), price: Math.max(0, Number(row.price_pence || 0) - addonTotal(row.addons_json)) }];
    return { id: row.id, date: row.date, startTime: row.start_time === "00:00" && metadata.source === "completed-treatment" ? null : row.start_time, services: serviceItems, addons: parseJson(row.addons_json, {}), originalPricePence: Number(row.price_pence || 0), priceAdjustmentPence: Number(row.price_adjustment_pence || 0), finalPricePence: Number(row.final_price_pence ?? row.price_pence ?? 0), paymentStatus: row.payment_status || "unpaid", status: row.status, source: metadata.source === "completed-treatment" ? "Completed treatment added by admin" : "Booking", editable: metadata.source === "completed-treatment", notes: typeof metadata.notes === "string" ? metadata.notes : "" };
  });
  return json({ client, history }, 200, origin);
}

async function addCompletedTreatment(request, env, origin) {
  const body = await request.json();
  const clientId = String(body.clientId || "").trim();
  const date = normaliseDate(body.date);
  const startTime = normaliseTime(body.time);
  const serviceIds = normaliseServices(body.services, body.serviceId);
  const addons = normaliseAddons(body.addons);
  const notes = String(body.notes || "").trim().slice(0, 2000);
  const adjustment = Number(body.priceAdjustmentPence || 0);
  const paymentStatus = String(body.paymentStatus || "paid");
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || !date || !serviceIds.length) return json({ error: "Please choose a client, date and at least one treatment." }, 400, origin);
  if (new Date(`${date}T00:00:00Z`) > new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) return json({ error: "A completed treatment cannot be dated in the future." }, 400, origin);
  if (serviceIds.some(id => !SERVICES[id]) || new Set(serviceIds).size !== serviceIds.length) return json({ error: "Please choose valid, different treatments." }, 400, origin);
  if (!Number.isInteger(adjustment) || adjustment < -100000 || adjustment > 100000) return json({ error: "Please provide a valid price adjustment." }, 400, origin);
  if (!["unpaid", "paid", "refunded", "not-required"].includes(paymentStatus)) return json({ error: "Please choose a valid payment status." }, 400, origin);
  const client = await env.DB.prepare("SELECT id,first_name,surname FROM clients WHERE id=? LIMIT 1").bind(clientId).first();
  if (!client) return json({ error: "Client not found." }, 404, origin);
  const serviceItems = serviceIds.map(id => ({ id, name: SERVICES[id][0], price: SERVICES[id][1] }));
  const addonTotalPence = Object.entries(addons).reduce((sum, [id, qty]) => sum + ADDONS[id][1] * qty, 0);
  const originalPrice = serviceItems.reduce((sum, item) => sum + item.price, 0) + addonTotalPence;
  const finalPrice = Math.max(0, originalPrice + adjustment);
  const now = new Date().toISOString();
  const bookingId = crypto.randomUUID();
  const slotResult = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,'booked',?,?) RETURNING id").bind(date, startTime, JSON.stringify(serviceIds), now, now).first();
  if (!slotResult?.id) return json({ error: "The treatment could not be recorded." }, 500, origin);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at,price_adjustment_pence,final_price_pence,payment_status,selected_services_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(bookingId,slotResult.id,clientId,serviceIds[0],serviceIds[0],date,startTime,originalPrice,JSON.stringify(addons),"completed",now,now,adjustment,finalPrice,paymentStatus,JSON.stringify(serviceItems)),
    env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),bookingId,"completed_treatment_added",JSON.stringify({ source: "completed-treatment", notes }),now)
  ]);
  return json({ ok: true, treatment: { id: bookingId, date, services: serviceItems, addons, originalPricePence: originalPrice, priceAdjustmentPence: adjustment, finalPricePence: finalPrice, paymentStatus, notes } }, 201, origin);
}

async function updateCompletedTreatment(id, request, env, origin) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Treatment not found." }, 404, origin);
  const body = await request.json();
  const existing = await env.DB.prepare(`SELECT b.id,b.slot_id,b.client_id,b.date,b.start_time,b.status,(SELECT metadata_json FROM booking_events e WHERE e.booking_id=b.id AND e.event_type IN ('completed_treatment_added','completed_treatment_updated') ORDER BY e.created_at DESC LIMIT 1) AS history_metadata FROM bookings b WHERE b.id=? LIMIT 1`).bind(id).first();
  if (!existing) return json({ error: "Treatment not found." }, 404, origin);
  const metadata = parseJson(existing.history_metadata, {});
  if (metadata.source !== "completed-treatment") return json({ error: "Only completed treatments added by admin can be edited here." }, 400, origin);
  const date = normaliseDate(body.date);
  const startTime = normaliseTime(body.time);
  const serviceIds = normaliseServices(body.services, body.serviceId);
  const addons = normaliseAddons(body.addons);
  const notes = String(body.notes || "").trim().slice(0, 2000);
  const adjustment = Number(body.priceAdjustmentPence || 0);
  const paymentStatus = String(body.paymentStatus || "paid");
  if (!date || !serviceIds.length) return json({ error: "Please choose a date and at least one treatment." }, 400, origin);
  if (new Date(`${date}T00:00:00Z`) > new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) return json({ error: "A completed treatment cannot be dated in the future." }, 400, origin);
  if (serviceIds.some(id => !SERVICES[id]) || new Set(serviceIds).size !== serviceIds.length) return json({ error: "Please choose valid, different treatments." }, 400, origin);
  if (!Number.isInteger(adjustment) || adjustment < -100000 || adjustment > 100000) return json({ error: "Please provide a valid price adjustment." }, 400, origin);
  if (!["unpaid", "paid", "refunded", "not-required"].includes(paymentStatus)) return json({ error: "Please choose a valid payment status." }, 400, origin);
  const serviceItems = serviceIds.map(serviceId => ({ id: serviceId, name: SERVICES[serviceId][0], price: SERVICES[serviceId][1] }));
  const addonTotalPence = Object.entries(addons).reduce((sum, [addonId, qty]) => sum + ADDONS[addonId][1] * qty, 0);
  const originalPrice = serviceItems.reduce((sum, item) => sum + item.price, 0) + addonTotalPence;
  const finalPrice = Math.max(0, originalPrice + adjustment);
  const now = new Date().toISOString();
  const updatedMetadata = { source: "completed-treatment", notes };
  await env.DB.batch([
    env.DB.prepare("UPDATE availability_slots SET date=?,start_time=?,service_ids_json=?,updated_at=? WHERE id=?").bind(date,startTime,JSON.stringify(serviceIds),now,existing.slot_id),
    env.DB.prepare("UPDATE bookings SET date=?,start_time=?,service_id=?,booked_service_id=?,price_pence=?,addons_json=?,updated_at=?,price_adjustment_pence=?,final_price_pence=?,payment_status=?,selected_services_json=? WHERE id=?").bind(date,startTime,serviceIds[0],serviceIds[0],originalPrice,JSON.stringify(addons),now,adjustment,finalPrice,paymentStatus,JSON.stringify(serviceItems),id),
    env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,"completed_treatment_updated",JSON.stringify(updatedMetadata),now)
  ]);
  return json({ ok: true, treatment: { id, date, time: startTime, services: serviceItems, addons, originalPricePence: originalPrice, priceAdjustmentPence: adjustment, finalPricePence: finalPrice, paymentStatus, notes } }, 200, origin);
}

async function admin(request, env, origin, handler) { if (!await readSession(request, env)) return json({ error: "Not authorised." }, 401, origin); return handler(); }
async function readSession(request, env) { if (!env.SESSION_SECRET) return null; const auth = request.headers.get("Authorization") || ""; const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null; if (!token) return null; const [encoded, signature] = token.split("."); if (!encoded || !signature) return null; try { const payload = fromB64url(encoded); if (!safeEqual(signature, await sign(payload, env.SESSION_SECRET))) return null; const i = payload.lastIndexOf("|"), email = payload.slice(0, i), expiry = Number(payload.slice(i + 1)); if (!email || !Number.isFinite(expiry) || Date.now() > expiry) return null; if (env.ADMIN_EMAIL && email !== normaliseEmail(env.ADMIN_EMAIL)) return null; return { email, expiry }; } catch { return null; } }
function corsHeaders(origin) { return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" }; }
function json(data,status,origin) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
function normaliseEmail(value) { return String(value || "").trim().toLowerCase().slice(0,254); }
function fromB64url(value) { const s = value.replace(/-/g,"+").replace(/_/g,"/"); return new TextDecoder().decode(Uint8Array.from(atob(s+"=".repeat((4-s.length%4)%4)), c=>c.charCodeAt(0))); }
function b64urlBytes(bytes) { let s=""; for (const byte of bytes) s+=String.fromCharCode(byte); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
async function sign(value,secret) { const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]); return b64urlBytes(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))); }
function safeEqual(a,b) { if(a.length!==b.length)return false; let d=0; for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
function normaliseDate(value) { const raw=String(value||"").trim(); let match=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(match){const[,d,m,y]=match;return validDate(y,m,d)?`${y}-${m}-${d}`:"";} match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/); return match&&validDate(match[1],match[2],match[3])?raw:""; }
function validDate(y,m,d){const dt=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));return dt.getUTCFullYear()===Number(y)&&dt.getUTCMonth()===Number(m)-1&&dt.getUTCDate()===Number(d);}
function normaliseTime(value){const raw=String(value||"").trim();return /^\d{2}:\d{2}$/.test(raw)&&Number(raw.slice(0,2))<24&&Number(raw.slice(3))<60?raw:"00:00";}
function normaliseServices(value,fallback){const source=Array.isArray(value)?value:[fallback];return[...new Set(source.map(v=>String(v||"").trim()).filter(Boolean))];}
function normaliseAddons(value){if(!value||typeof value!=="object")return{};const out={};for(const id of Object.keys(ADDONS)){const n=Math.floor(Number(value[id]||0));if(Number.isFinite(n)&&n>0)out[id]=Math.min(n,10);}return out;}
function parseJson(value,fallback){try{const parsed=JSON.parse(value||"");return parsed??fallback;}catch{return fallback;}}
function serviceName(id){return SERVICES[id]?.[0]||id;}
function addonTotal(value){const addons=parseJson(value,{});return Object.entries(addons).reduce((sum,[id,qty])=>sum+(ADDONS[id]?.[1]||0)*Number(qty||0),0);}
