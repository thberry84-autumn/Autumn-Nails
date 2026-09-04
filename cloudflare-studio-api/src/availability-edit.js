export async function handleAvailabilityEdit(request, env, ctx, origin, pathname) {
  if (request.method !== "PATCH" || !pathname.startsWith("/api/availability/")) return null;
  if (!ctx?.access) return json({ error: "Studio authentication is required." }, 401, origin);
  const identity = await ctx.access.getIdentity();
  if (!identity?.email) return json({ error: "Studio identity could not be verified." }, 403, origin);

  const id = Number(pathname.split("/").pop());
  if (!Number.isInteger(id)) return json({ error: "Invalid appointment space." }, 400, origin);

  const current = await env.DB.prepare("SELECT id,date,start_time,service_ids_json,status FROM availability_slots WHERE id=? LIMIT 1").bind(id).first();
  if (!current) return json({ error: "Appointment space not found." }, 404, origin);
  if (current.status === "booked") return json({ error: "A booked appointment space cannot be edited. Cancel the booking first." }, 409, origin);

  const body = await request.json();
  const date = cleanDate(body.date ?? current.date);
  const startTime = cleanTime(body.startTime ?? current.start_time);
  const serviceIds = Array.isArray(body.serviceIds)
    ? [...new Set(body.serviceIds.map(String).filter(id => SERVICE_IDS.has(id)))]
    : parseJson(current.service_ids_json, []);

  if (!date || !startTime) return json({ error: "Please provide a valid date and time." }, 400, origin);

  const now = new Date().toISOString();
  try {
    await env.DB.prepare("UPDATE availability_slots SET date=?,start_time=?,service_ids_json=?,updated_at=? WHERE id=? AND status='available'")
      .bind(date, startTime, JSON.stringify(serviceIds), now, id).run();
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error: "That appointment space already exists." }, 409, origin);
    throw error;
  }
  return json({ ok: true, id, date, startTime, serviceIds }, 200, origin);
}

const SERVICE_IDS = new Set([
  "basic-manicure","gel-polish","builder-full-set","builder-infill",
  "builder-gel-full-set","builder-gel-infill","acrylic-full-set","express-gel-toes"
]);
function cleanDate(value){const v=String(value||"").trim();const m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return "";const dt=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));return dt.getUTCFullYear()===Number(m[1])&&dt.getUTCMonth()===Number(m[2])-1&&dt.getUTCDate()===Number(m[3])?v:"";}
function cleanTime(value){const v=String(value||"").trim();return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)?v:"";}
function parseJson(value,fallback){try{const parsed=JSON.parse(value??"");return parsed??fallback;}catch{return fallback;}}
function cors(origin){return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store"};}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});}
