// Studio mutation endpoints: POST-only calendar actions to avoid browser preflight issues.
function cors(origin){return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,PUT,DELETE,OPTIONS","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store"};}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});}
function httpError(status,message){const error=new Error(message);error.status=status;return error;}
function validId(id){return /^[0-9a-f-]{36}$/i.test(String(id));}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
function validTime(value){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));}

async function requireAccess(ctx){
  if(!ctx?.access)throw httpError(401,"Studio authentication is required.");
  const identity=await ctx.access.getIdentity();
  if(!identity?.email)throw httpError(403,"Studio identity could not be verified.");
  return identity;
}

export async function handleStudioMutation(request,env,ctx,origin,pathname){
  if(request.method!=="POST")return null;

  if(pathname.startsWith("/api/availability/")&&pathname.endsWith("/edit")){
    await requireAccess(ctx);
    const id=Number(pathname.split("/").slice(-2,-1)[0]);
    if(!Number.isInteger(id))return json({error:"Invalid appointment space."},400,origin);
    const current=await env.DB.prepare("SELECT id,date,start_time,service_ids_json,status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(id).first();
    if(!current)return json({error:"Appointment space not found."},404,origin);
    if(current.status==="booked")return json({error:"A booked appointment space cannot be edited. Cancel the booking first."},409,origin);
    const type=request.headers.get("content-type")||"";
    let body={};
    if(type.includes("application/x-www-form-urlencoded")){const form=await request.formData();body={date:String(form.get("date")||current.date),startTime:String(form.get("startTime")||current.start_time),serviceIds:parseJson(String(form.get("serviceIds")||current.service_ids_json||"[]"),[])};}
    else {body=await request.json();}
    const date=String(body.date||current.date).trim();
    const startTime=String(body.startTime||current.start_time).trim();
    const serviceIds=Array.isArray(body.serviceIds)?[...new Set(body.serviceIds.map(String).filter(Boolean))]:parseJson(current.service_ids_json,[]);
    if(!validDate(date)||!validTime(startTime))return json({error:"Please provide a valid date and time."},400,origin);
    if(startTime<'09:00'||startTime>'22:00')return json({error:"Appointment times must be between 09:00 and 22:00."},400,origin);
    try{
      const now=new Date().toISOString();
      await env.DB.prepare("UPDATE availability_slots SET date=?,start_time=?,service_ids_json=?,updated_at=? WHERE id=? AND status='available'").bind(date,startTime,JSON.stringify(serviceIds),now,id).run();
      return json({ok:true,id,date,startTime,serviceIds},200,origin);
    }catch(error){
      if(String(error?.message||error).toLowerCase().includes('unique'))return json({error:"That appointment space already exists."},409,origin);
      throw error;
    }
  }

  if(pathname.startsWith("/api/availability/")&&pathname.endsWith("/remove")){
    await requireAccess(ctx);
    const id=Number(pathname.split("/").slice(-2,-1)[0]);
    if(!Number.isInteger(id))return json({error:"Invalid appointment space."},400,origin);
    const row=await env.DB.prepare("SELECT status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(id).first();
    if(!row)return json({error:"Appointment space not found."},404,origin);
    if(row.status==="booked")return json({error:"A booked appointment space cannot be removed. Cancel the booking instead."},409,origin);
    if(row.removed_at)return json({ok:true},200,origin);
    const now=new Date().toISOString();
    await env.DB.prepare("UPDATE availability_slots SET removed_at=?,updated_at=? WHERE id=? AND removed_at IS NULL").bind(now,now,id).run();
    return json({ok:true},200,origin);
  }

  if(pathname.startsWith("/api/bookings/")&&pathname.endsWith("/cancel")){
    await requireAccess(ctx);
    const id=pathname.split("/").slice(-2,-1)[0];
    if(!validId(id))return json({error:"Invalid booking."},400,origin);
    const current=await env.DB.prepare("SELECT id,status,slot_id FROM bookings WHERE id=? LIMIT 1").bind(id).first();
    if(!current)return json({error:"Booking not found."},404,origin);
    if(!current.slot_id)return json({error:"This booking has no linked appointment space."},409,origin);
    const slot=await env.DB.prepare("SELECT id,status,removed_at FROM availability_slots WHERE id=? LIMIT 1").bind(current.slot_id).first();
    if(!slot)return json({error:"The linked appointment space could not be found."},409,origin);
    if(slot.removed_at)return json({error:"The linked appointment space has been removed and cannot be released."},409,origin);
    const now=new Date().toISOString();
    try {
      if(current.status==="cancelled"){
        if(slot.status==="booked"){
          await env.DB.batch([
            env.DB.prepare("UPDATE availability_slots SET status='available',updated_at=? WHERE id=? AND status='booked'").bind(now,current.slot_id),
            env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,"studio_booking_updated",JSON.stringify({status:"cancelled",reason:"studio_cancel_repair"}),now)
          ]);
        }
        return json({ok:true},200,origin);
      }
      if(slot.status!=="booked")return json({error:"The linked appointment space is no longer marked as booked."},409,origin);
      await env.DB.batch([
        env.DB.prepare("UPDATE bookings SET status='cancelled',updated_at=? WHERE id=? AND status!='cancelled'").bind(now,id),
        env.DB.prepare("UPDATE availability_slots SET status='available',updated_at=? WHERE id=? AND status='booked'").bind(now,current.slot_id),
        env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,"studio_booking_updated",JSON.stringify({status:"cancelled",reason:"studio_cancel"}),now)
      ]);
    } catch(error) {
      console.error("Studio cancellation failed", error);
      throw httpError(500,`Could not cancel appointment: ${String(error?.message||error)}`);
    }
    return json({ok:true},200,origin);
  }
  return null;
}

function parseJson(value,fallback){try{const parsed=JSON.parse(String(value||''));return parsed??fallback;}catch{return fallback;}}
