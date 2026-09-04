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
    const withoutLegacyStyle = withCalendar.replace(/<style>[\s\S]*?<\/style>/i, "");
    const withPublicHeaderBehaviour = withoutLegacyStyle
      .replace('href="#home"><img', 'href="https://autumnnails.com"><img')
      .replace('</nav><div class="who"', '</nav><button class="menu" aria-label="Open menu" aria-controls="studioTopbar" onclick="document.getElementById(\'studioTopbar\').classList.toggle(\'open\')">☰</button><div class="who"')
      .replace('<header class="topbar">', '<header class="topbar" id="studioTopbar">');
    const footer = `<footer><div class="wrap footer-grid"><div><a class="brand" href="https://autumnnails.com"><strong>Autumn</strong><span>Nails</span></a><div class="small" style="margin-top:10px">A calm little space for beautiful nails.</div><div class="small" style="margin-top:14px">Studio</div></div><div class="footer-links"><a href="https://autumnnails.com">Customer website</a><a href="https://autumnnails.com/services.html">Services &amp; Booking</a><a href="https://autumnnails.com/gallery.html">Gallery</a><a href="https://autumnnails.com/contact.html">Contact</a></div></div></footer>`;
    const styles = '<link rel="stylesheet" href="/studio.css?v=20260904i">';
    const scripts = '<script src="/studio-actions.js?v=20260904f"></script><script src="/studio-calendar.js?v=20260904f"></script><script src="/studio-booking-fixes.js?v=20260904f"></script><script>(function(){const clean=()=>document.querySelectorAll("style#studio-polish-css,style:not([id])").forEach(s=>{if(s.id==="studio-polish-css"||s.textContent.includes("#studioCalendar{"))s.remove()});new MutationObserver(clean).observe(document.head,{childList:true});clean()})();</script><script>(function(){async function enhance(){const host=document.getElementById("financeTable");const table=host?.querySelector("table");if(!table||table.dataset.amendReady==="1")return;const finance=await api(BOOKING_API,"/api/finance").catch(()=>null);const financeRows=finance?.rows||[];const head=table.querySelector("thead tr");if(head){const th=document.createElement("th");th.textContent="Actions";head.appendChild(th)}table.querySelectorAll("tbody tr").forEach((row,index)=>{const cells=row.querySelectorAll("td");if(cells.length<6)return;const bookingId=financeRows[index]?.id||"";if(!bookingId)return;row.dataset.bookingId=bookingId;const amend=document.createElement("button");amend.type="button";amend.className="button secondary";amend.textContent="Amend";amend.addEventListener("click",()=>{if(row.querySelector(".finance-amend"))return;const original=cells[2].textContent.trim().replace("£","");const adjustment=cells[3].textContent.trim().replace("£","");const payment=cells[5].textContent.trim();const originalValue=Number(original)||0;const wrap=document.createElement("div");wrap.className="finance-amend";wrap.style.marginTop="8px";wrap.innerHTML=`<div style="display:grid;gap:6px;min-width:170px"><label style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em">Adjustment £</label><input type="number" step="0.01" value="${adjustment}"><label style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em">Payment</label><select><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option><option value="not-required">Not required</option></select><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><button type="button" class="button">Save</button><button type="button" class="button secondary">Cancel</button></div><span class="msg"></span></div>`;const input=wrap.querySelector("input"),select=wrap.querySelector("select"),save=wrap.querySelector("button:not(.secondary)"),cancel=wrap.querySelector("button.secondary"),message=wrap.querySelector(".msg");const match=["unpaid","paid","refunded","not-required"].find(v=>v===payment)||"unpaid";select.value=match;save.addEventListener("click",async()=>{const value=Math.round((Number(input.value)||0)*100);if(!Number.isFinite(value)||value<-100000||value>100000){message.textContent="Please enter a valid adjustment.";return}save.disabled=true;message.textContent="Saving…";try{if(!row.dataset.bookingId)throw Error("Booking ID unavailable.");await api(BOOKING_API,"/api/bookings/"+encodeURIComponent(row.dataset.bookingId),{method:"PATCH",body:JSON.stringify({priceAdjustmentPence:value,paymentStatus:select.value})});wrap.remove();amend.disabled=false;loadFinance()}catch(e){message.textContent=e.message;save.disabled=false}});cancel.addEventListener("click",()=>wrap.remove());cells[6].appendChild(wrap)});table.dataset.amendReady="1"}const observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});enhance()})();</script>';
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
