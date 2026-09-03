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

export async function handleStudioAction(request, env, ctx, origin, pathname) {
  const identity = await requireAccess(ctx);
  if (!identity?.email) return json({ error: "Studio identity could not be verified." }, 403, origin);
  if (pathname === "/api/manual-booking" && request.method === "POST") return manualBooking(request, env, origin);
  if (pathname === "/api/completed-treatment" && request.method === "POST") return completedTreatment(request, env, origin);
  if (pathname.startsWith("/api/completed-treatment/") && request.method === "PATCH") return updateCompletedTreatment(pathname.split("/").pop(), request, env, origin);
  return null;
}

async function manualBooking(request, env, origin) {
  const body = await request.json();
  const clientId = String(body.clientId || "").trim();
  const date = normaliseDate(body.date);
  const time = normaliseTime(body.time);
  const services = normaliseServices(body.services, body.serviceId);
  const addons = normaliseAddons(body.addons);
  const adjustment = Number(body.priceAdjustmentPence || 0);
  const paymentStatus = String(body.paymentStatus || "unpaid");
  if (!validId(clientId) || !date || !time || !services.length) return json({ error: "Please choose a client, date, time and at least one treatment." }, 400, origin);
  if (!validServiceList(services)) return json({ error: "Please choose valid, different treatments." }, 400, origin);
  if (!Number.isInteger(adjustment) || adjustment < -100000 || adjustment > 100000) return json({ error: "Please provide a valid price adjustment." }, 400, origin);
  if (!validPayment(paymentStatus)) return json({ error: "Please choose a valid payment status." }, 400, origin);
  const client = await env.DB.prepare("SELECT id,first_name,surname FROM clients WHERE id=? LIMIT 1").bind(clientId).first();
  if (!client) return json({ error: "Client not found." }, 404, origin);
  const serviceItems = services.map(id => ({ id, name: SERVICES[id][0], price: SERVICES[id][1] }));
  const originalPrice = serviceItems.reduce((sum, item) => sum + item.price, 0) + addonTotal(addons);
  const finalPrice = Math.max(0, originalPrice + adjustment);
  const now = new Date().toISOString();
  const bookingId = crypto.randomUUID();
  let slot;
  try {
    slot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,'booked',?,?) RETURNING id").bind(date,time,JSON.stringify(services),now,now).first();
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error: "An appointment space already exists at that date and time." }, 409, origin);
    throw error;
  }
  if (!slot?.id) return json({ error: "The booking could not be created." }, 500, origin);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at,price_adjustment_pence,final_price_pence,payment_status,selected_services_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(bookingId,slot.id,clientId,services[0],services[0],date,time,originalPrice,JSON.stringify(addons),"confirmed",now,now,adjustment,finalPrice,paymentStatus,JSON.stringify(serviceItems)),
      env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),bookingId,"studio_manual_booking_added",JSON.stringify({ source:"studio-manual-booking" }),now)
    ]);
  } catch (error) {
    await env.DB.prepare("DELETE FROM availability_slots WHERE id=? AND status='booked'").bind(slot.id).run();
    throw error;
  }
  return json({ ok:true, booking:{ id:bookingId, client, date, time, services:serviceItems, addons, originalPricePence:originalPrice, priceAdjustmentPence:adjustment, finalPricePence:finalPrice, paymentStatus } },201,origin);
}

async function completedTreatment(request, env, origin) {
  const body = await request.json();
  const clientId = String(body.clientId || "").trim();
  const date = normaliseDate(body.date);
  const time = normaliseTime(body.time) || "00:00";
  const services = normaliseServices(body.services, body.serviceId);
  const addons = normaliseAddons(body.addons);
  const notes = String(body.notes || "").trim().slice(0,2000);
  const adjustment = Number(body.priceAdjustmentPence || 0);
  const paymentStatus = String(body.paymentStatus || "paid");
  const today = new Date().toISOString().slice(0,10);
  if (!validId(clientId) || !date || !services.length) return json({ error:"Please choose a client, date and at least one treatment." },400,origin);
  if (date > today) return json({ error:"A completed treatment cannot be dated in the future." },400,origin);
  if (!validServiceList(services)) return json({ error:"Please choose valid, different treatments." },400,origin);
  if (!Number.isInteger(adjustment) || adjustment < -100000 || adjustment > 100000) return json({ error:"Please provide a valid price adjustment." },400,origin);
  if (!validPayment(paymentStatus)) return json({ error:"Please choose a valid payment status." },400,origin);
  const client = await env.DB.prepare("SELECT id,first_name,surname FROM clients WHERE id=? LIMIT 1").bind(clientId).first();
  if (!client) return json({ error:"Client not found." },404,origin);
  const serviceItems = services.map(id => ({ id, name:SERVICES[id][0], price:SERVICES[id][1] }));
  const originalPrice = serviceItems.reduce((sum,item)=>sum+item.price,0) + addonTotal(addons);
  const finalPrice = Math.max(0,originalPrice+adjustment);
  const now = new Date().toISOString();
  const bookingId = crypto.randomUUID();
  let slot;
  try {
    slot = await env.DB.prepare("INSERT INTO availability_slots (date,start_time,service_ids_json,status,created_at,updated_at) VALUES (?,?,?,'booked',?,?) RETURNING id").bind(date,time,JSON.stringify(services),now,now).first();
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error:"An appointment space already exists at that date and time." },409,origin);
    throw error;
  }
  if (!slot?.id) return json({ error:"The treatment could not be recorded." },500,origin);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO bookings (id,slot_id,client_id,service_id,booked_service_id,date,start_time,price_pence,addons_json,status,created_at,updated_at,price_adjustment_pence,final_price_pence,payment_status,selected_services_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(bookingId,slot.id,clientId,services[0],services[0],date,time,originalPrice,JSON.stringify(addons),"completed",now,now,adjustment,finalPrice,paymentStatus,JSON.stringify(serviceItems)),
      env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),bookingId,"completed_treatment_added",JSON.stringify({ source:"completed-treatment", notes }),now)
    ]);
  } catch (error) {
    await env.DB.prepare("DELETE FROM availability_slots WHERE id=? AND status='booked'").bind(slot.id).run();
    throw error;
  }
  return json({ ok:true, treatment:{ id:bookingId, client, date, time, services:serviceItems, addons, originalPricePence:originalPrice, priceAdjustmentPence:adjustment, finalPricePence:finalPrice, paymentStatus, notes } },201,origin);
}

async function updateCompletedTreatment(id, request, env, origin) {
  if (!validId(id)) return json({ error:"Treatment not found." },404,origin);
  const existing = await env.DB.prepare(`SELECT b.id,b.slot_id,b.client_id,b.status,(SELECT metadata_json FROM booking_events e WHERE e.booking_id=b.id AND e.event_type IN ('completed_treatment_added','completed_treatment_updated') ORDER BY e.created_at DESC LIMIT 1) AS history_metadata FROM bookings b WHERE b.id=? LIMIT 1`).bind(id).first();
  if (!existing) return json({ error:"Treatment not found." },404,origin);
  const metadata = parseJson(existing.history_metadata,{});
  if (metadata.source !== "completed-treatment") return json({ error:"Only completed treatments added in Studio can be edited here." },400,origin);
  const body = await request.json();
  const date = normaliseDate(body.date), time = normaliseTime(body.time) || "00:00", services = normaliseServices(body.services,body.serviceId), addons = normaliseAddons(body.addons);
  const notes = String(body.notes || "").trim().slice(0,2000), adjustment = Number(body.priceAdjustmentPence || 0), paymentStatus = String(body.paymentStatus || "paid");
  if (!date || !services.length) return json({ error:"Please choose a date and at least one treatment." },400,origin);
  if (date > new Date().toISOString().slice(0,10)) return json({ error:"A completed treatment cannot be dated in the future." },400,origin);
  if (!validServiceList(services)) return json({ error:"Please choose valid, different treatments." },400,origin);
  if (!Number.isInteger(adjustment) || adjustment < -100000 || adjustment > 100000) return json({ error:"Please provide a valid price adjustment." },400,origin);
  if (!validPayment(paymentStatus)) return json({ error:"Please choose a valid payment status." },400,origin);
  const serviceItems = services.map(serviceId=>({id:serviceId,name:SERVICES[serviceId][0],price:SERVICES[serviceId][1]}));
  const originalPrice = serviceItems.reduce((sum,item)=>sum+item.price,0)+addonTotal(addons);
  const finalPrice = Math.max(0,originalPrice+adjustment);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE availability_slots SET date=?,start_time=?,service_ids_json=?,updated_at=? WHERE id=?").bind(date,time,JSON.stringify(services),now,existing.slot_id),
    env.DB.prepare("UPDATE bookings SET date=?,start_time=?,service_id=?,booked_service_id=?,price_pence=?,addons_json=?,updated_at=?,price_adjustment_pence=?,final_price_pence=?,payment_status=?,selected_services_json=? WHERE id=?").bind(date,time,services[0],services[0],originalPrice,JSON.stringify(addons),now,adjustment,finalPrice,paymentStatus,JSON.stringify(serviceItems),id),
    env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,"completed_treatment_updated",JSON.stringify({source:"completed-treatment",notes}),now)
  ]);
  return json({ok:true,treatment:{id,date,time,services:serviceItems,addons,originalPricePence:originalPrice,priceAdjustmentPence:adjustment,finalPricePence:finalPrice,paymentStatus,notes}},200,origin);
}

async function requireAccess(ctx){
  if(!ctx?.access) throw httpError(401,"Studio authentication is required.");
  return ctx.access.getIdentity();
}
function validId(value){return /^[0-9a-f-]{36}$/i.test(String(value||""));}
function validServiceList(values){return values.every(id=>SERVICES[id]) && new Set(values).size===values.length;}
function normaliseServices(value,fallback){const values=Array.isArray(value)?value:(fallback?[fallback]:[]);return [...new Set(values.map(String).filter(id=>SERVICES[id]))];}
function normaliseAddons(value){const out={};if(!value||typeof value!=="object")return out;for(const [id,qty] of Object.entries(value)){const n=Math.max(0,Math.min(10,Math.round(Number(qty))));if(ADDONS[id]&&Number.isFinite(n)&&n>0)out[id]=n;}return out;}
function addonTotal(addons){return Object.entries(addons).reduce((sum,[id,qty])=>sum+ADDONS[id][1]*qty,0);}
function validPayment(value){return ["unpaid","paid","refunded","not-required"].includes(value);}
function normaliseDate(value){const raw=String(value||"").trim();let m=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m){const[,d,mo,y]=m;return validDate(y,mo,d)?`${y}-${mo}-${d}`:"";}m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m&&validDate(m[1],m[2],m[3])?raw:"";}
function normaliseTime(value){const v=String(value||"").trim();return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)?v:"";}
function validDate(y,m,d){const dt=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));return dt.getUTCFullYear()===Number(y)&&dt.getUTCMonth()===Number(m)-1&&dt.getUTCDate()===Number(d);}
function parseJson(value,fallback){try{const parsed=JSON.parse(value??"");return parsed??fallback;}catch{return fallback;}}
function httpError(status,message){const e=new Error(message);e.status=status;return e;}
function cors(origin){return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store"};}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});}
