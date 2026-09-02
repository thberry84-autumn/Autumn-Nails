import calendarWorker from "./index-calendar.js";

const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/admin/clients" && request.method === "GET") {
      return admin(request, env, () => listClients(env));
    }
    if (url.pathname === "/api/admin/manual-booking" && request.method === "POST") {
      return admin(request, env, () => manualBooking(request, env));
    }
    if (url.pathname.startsWith("/api/admin/bookings/") && url.pathname.endsWith("/finance") && request.method === "PATCH") {
      const id = decodeURIComponent(url.pathname.split("/")[4] || "");
      return admin(request, env, () => updateFinance(id, request, env));
    }
    return calendarWorker.fetch(request, env, ctx);
  }
};

async function admin(request, env, handler) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "Not authorised." }, 401);
  return handler();
}

async function listClients(env) {
  const result = await env.DB.prepare(`SELECT c.id,c.first_name,c.surname,c.email,c.phone,c.marketing_opt_in,c.created_at,c.updated_at,
    COUNT(b.id) AS booking_count,
    MAX(CASE WHEN b.status IN ('confirmed','completed') THEN b.date END) AS last_booking_date
    FROM clients c LEFT JOIN bookings b ON b.client_id=c.id
    GROUP BY c.id ORDER BY c.surname,c.first_name`).all();
  return json({ clients: result.results || [] });
}

async function manualBooking(request, env) {
  const body = await request.json();
  const clientId = String(body.clientId || "").trim();
  const slotId = Number(body.slotId);
  const serviceId = String(body.serviceId || "");
  if (!clientId || !Number.isInteger(slotId) || !SERVICES[serviceId]) return json({ error: "Please provide a client, service and valid appointment slot." }, 400);
  const client = await env.DB.prepare("SELECT id FROM clients WHERE id=? LIMIT 1").bind(clientId).first();
  const slot = await env.DB.prepare("SELECT id,date,start_time,status,removed_at,service_ids_json FROM availability_slots WHERE id=? LIMIT 1").bind(slotId).first();
  if (!client || !slot) return json({ error: "Client or appointment slot not found." }, 404);
  if (slot.status !== "available" || slot.removed_at) return json({ error: "That appointment slot is no longer available." }, 409);
  const allowed = parseJson(slot.service_ids_json, []);
  if (allowed.length && !allowed.includes(serviceId)) return json({ error: "That service is not available at the selected time." }, 409);
  const addons = normaliseAddons(body.addons);
  const addonPrices = { "nail-art": 100, "nail-stamping": 100, "nail-stamping-full-set": 600 };
  const addonTotal = Object.entries(addons).reduce((sum,[id,qty]) => sum + (addonPrices[id] || 0) * qty, 0);
  const basePrice = SERVICES[serviceId][1];
  const total = basePrice + addonTotal;
  const now = new Date().toISOString(), bookingId = crypto.randomUUID();
  const statements = [
    env.DB.prepare("UPDATE availability_slots SET status='booked',updated_at=? WHERE id=? AND status='available' AND removed_at IS NULL").bind(now, slotId),
    env.DB.prepare("INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at,price_adjustment_pence,final_price_pence,payment_status) VALUES (?,?,?,?,?,?,?,?,?,'confirmed',?,?,?,?,?)").bind(bookingId,slotId,clientId,serviceId,serviceId,slot.date,slot.start_time,total,JSON.stringify(addons),now,now,0,total,'unpaid'),
    env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?, ?,?)").bind(crypto.randomUUID(),bookingId,"manual_created",JSON.stringify({serviceId,total}),now)
  ];
  const results = await env.DB.batch(statements);
  if (!results[0]?.meta?.changes) return json({ error: "That appointment was just taken. Please choose another slot." }, 409);
  return json({ ok: true, booking: { id: bookingId, date: slot.date, startTime: slot.start_time, endTime: addMinutesToTime(slot.start_time,120), service: SERVICES[serviceId][0], price: total } }, 201);
}

async function updateFinance(id, request, env) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Booking not found." }, 404);
  const body = await request.json();
  const adjustment = Number(body.priceAdjustmentPence || 0);
  const paymentStatus = String(body.paymentStatus || "unpaid");
  if (!Number.isInteger(adjustment) || !["unpaid","paid","refunded","not-required"].includes(paymentStatus)) return json({ error: "Invalid price adjustment or payment status." }, 400);
  const booking = await env.DB.prepare("SELECT id,price_pence FROM bookings WHERE id=? LIMIT 1").bind(id).first();
  if (!booking) return json({ error: "Booking not found." }, 404);
  const finalPrice = Math.max(0, booking.price_pence + adjustment);
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE bookings SET price_adjustment_pence=?,final_price_pence=?,payment_status=?,updated_at=? WHERE id=?").bind(adjustment,finalPrice,paymentStatus,now,id).run();
  if (!result.meta.changes) return json({ error: "Booking could not be updated." }, 409);
  await env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?, ?,?)").bind(crypto.randomUUID(),id,"finance_updated",JSON.stringify({adjustmentPence:adjustment,finalPricePence:finalPrice,paymentStatus}),now).run();
  return json({ ok:true, booking:{id,originalPricePence:booking.price_pence,priceAdjustmentPence:adjustment,finalPricePence:finalPrice,paymentStatus} });
}

async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const auth=request.headers.get("Authorization")||"",token=auth.startsWith("Bearer ")?auth.slice(7).trim():null;
  if(!token)return null; const [encoded,signature]=token.split("."); if(!encoded||!signature)return null;
  try { const payload=fromB64url(encoded); if(!safeEqual(signature,await sign(payload,env.SESSION_SECRET)))return null; const i=payload.lastIndexOf("|"),email=payload.slice(0,i),expiry=Number(payload.slice(i+1)); if(!email||!Number.isFinite(expiry)||Date.now()>expiry)return null; if(env.ADMIN_EMAIL&&email!==normaliseEmail(env.ADMIN_EMAIL))return null; return {email,expiry}; } catch{return null;}
}
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64urlBytes(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));}
function safeEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function b64url(value){return b64urlBytes(new TextEncoder().encode(value));}
function b64urlBytes(bytes){let s="";for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function fromB64url(value){const s=value.replace(/-/g,"+").replace(/_/g,"/");return new TextDecoder().decode(Uint8Array.from(atob(s+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0)));}
function normaliseEmail(value){return String(value||"").trim().toLowerCase().slice(0,254);}
function normaliseAddons(value){if(!value||typeof value!=="object")return {};const out={};for(const id of ["nail-art","nail-stamping","nail-stamping-full-set"]){const n=Math.floor(Number(value[id]||0));if(Number.isFinite(n)&&n>0)out[id]=Math.min(n,10);}return out;}
function parseJson(value,fallback){try{return JSON.parse(value||"")}catch{return fallback;}}
function addMinutesToTime(time,minutes){const [h,m]=String(time).split(":").map(Number),total=h*60+m+minutes;return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;}
function json(data,status){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
