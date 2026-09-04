// Studio mutation endpoints: POST-only calendar actions to avoid browser preflight issues.
function cors(origin){return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,PUT,DELETE,OPTIONS","Vary":"Origin","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store"};}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});}
function httpError(status,message){const error=new Error(message);error.status=status;return error;}
function validId(id){return /^[0-9a-f-]{36}$/i.test(String(id));}

async function requireAccess(ctx){
  if(!ctx?.access)throw httpError(401,"Studio authentication is required.");
  const identity=await ctx.access.getIdentity();
  if(!identity?.email)throw httpError(403,"Studio identity could not be verified.");
  return identity;
}

export async function handleStudioMutation(request,env,ctx,origin,pathname){
  if(request.method!=="POST")return null;
  if(pathname.startsWith("/api/availability/")&&pathname.endsWith("/remove")){
    await requireAccess(ctx);
    const id=Number(pathname.split("/").slice(-2,-1)[0]);
    if(!Number.isInteger(id))return json({error:"Invalid appointment space."},400,origin);
    const row=await env.DB.prepare("SELECT status FROM availability_slots WHERE id=? LIMIT 1").bind(id).first();
    if(!row)return json({error:"Appointment space not found."},404,origin);
    if(row.status==="booked")return json({error:"A booked appointment space cannot be removed. Cancel the booking instead."},409,origin);
    await env.DB.prepare("DELETE FROM availability_slots WHERE id=?").bind(id).run();
    return json({ok:true},200,origin);
  }

  if(pathname.startsWith("/api/bookings/")&&pathname.endsWith("/cancel")){
    await requireAccess(ctx);
    const id=pathname.split("/").slice(-2,-1)[0];
    if(!validId(id))return json({error:"Invalid booking."},400,origin);
    const current=await env.DB.prepare("SELECT id,status,slot_id FROM bookings WHERE id=? LIMIT 1").bind(id).first();
    if(!current)return json({error:"Booking not found."},404,origin);
    if(current.status==="cancelled")return json({ok:true},200,origin);
    if(!current.slot_id)return json({error:"This booking has no linked appointment space."},409,origin);
    const slot=await env.DB.prepare("SELECT id,status FROM availability_slots WHERE id=? LIMIT 1").bind(current.slot_id).first();
    if(!slot)return json({error:"The linked appointment space could not be found."},409,origin);
    if(slot.status!=="booked")return json({error:"The linked appointment space is no longer marked as booked."},409,origin);
    const now=new Date().toISOString();
    try {
      await env.DB.prepare("UPDATE bookings SET status='cancelled',updated_at=? WHERE id=? AND status!='cancelled'").bind(now,id).run();
      await env.DB.prepare("UPDATE availability_slots SET status='available',updated_at=? WHERE id=? AND status='booked'").bind(now,current.slot_id).run();
      await env.DB.prepare("INSERT INTO booking_events (id,booking_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,"studio_booking_updated",JSON.stringify({status:"cancelled",reason:"studio_cancel"}),now).run();
    } catch(error) {
      console.error("Studio cancellation failed", error);
      throw httpError(500,`Could not cancel appointment: ${String(error?.message||error)}`);
    }
    return json({ok:true},200,origin);
  }
  return null;
}
