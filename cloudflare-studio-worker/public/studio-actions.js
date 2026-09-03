(() => {
  const ACTION_SERVICES = [
    ['basic-manicure','Basic Manicure',1500],['gel-polish','Gel Polish',2200],['builder-full-set','Builder Full Set',2800],['builder-infill','Builder Infill',2500],['builder-gel-full-set','Builder & Gel Polish Full Set',3000],['builder-gel-infill','Builder & Gel Polish Infill',2700],['acrylic-full-set','Acrylic – Full Set',3500],['express-gel-toes','Express Gel Toes',2200]
  ];
  const ACTION_ADDONS = [['nail-art','Nail Art (per nail)',100],['nail-stamping','Nail Stamping (per nail)',100],['nail-stamping-full-set','Nail Stamping (full set, per colour)',600]];
  const money2 = p => '£' + (Number(p || 0) / 100).toFixed(2);
  const esc2 = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  const serviceOptions = () => ACTION_SERVICES.map(s => `<option value="${s[0]}">${esc2(s[1])} — ${money2(s[2])}</option>`).join('');
  const clientOptions = () => (window.clients || []).map(c => `<option value="${esc2(c.id)}">${esc2(c.first_name+' '+c.surname)} — ${esc2(c.email)}</option>`).join('');
  const addonFields = prefix => ACTION_ADDONS.map(a => `<div class="field"><label>${esc2(a[1])}</label><input id="${prefix}-${a[0]}" type="number" min="0" max="50" step="1" value="0"></div>`).join('');

  function addBookingUI(){
    const bookings = document.querySelector('#bookings');
    if (!bookings || document.querySelector('#manualBookingPanel')) return;
    const hero = bookings.querySelector('.hero');
    const panel = document.createElement('section'); panel.id='manualBookingPanel'; panel.className='panel'; panel.style.marginBottom='18px';
    panel.innerHTML = `<div class="kicker">Private entry</div><h2>Add manual booking</h2><p class="muted">Use this for an appointment agreed outside the public booking flow. It creates the same booking record and marks the appointment space as booked.</p><div class="form-grid"><div class="field"><label>Client</label><select id="manual-client"><option value="">Choose client…</option>${clientOptions()}</select></div><div class="field"><label>Date</label><input id="manual-date" type="date"></div><div class="field"><label>Time</label><input id="manual-time" type="time"></div><div class="field"><label>Payment</label><select id="manual-payment"><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option><option value="not-required">Not required</option></select></div><div class="field"><label>Price adjustment (£)</label><input id="manual-adjustment" type="number" step="0.01" value="0"></div></div><div class="field" style="margin-top:12px"><label>Treatments</label><select id="manual-services" multiple size="7">${serviceOptions()}</select></div><div class="form-grid" style="margin-top:12px">${addonFields('manual')}</div><div class="actions"><button class="button" id="manual-save">Create booking</button><button class="button secondary" id="manual-close">Close</button><span class="msg" id="manual-msg"></span></div>`;
    hero.insertAdjacentElement('afterend',panel);
    panel.querySelector('#manual-close').onclick=()=>panel.remove();
    panel.querySelector('#manual-save').onclick=async()=>{
      const msg=panel.querySelector('#manual-msg'); msg.textContent='';
      const body={clientId:panel.querySelector('#manual-client').value,date:panel.querySelector('#manual-date').value,time:panel.querySelector('#manual-time').value,services:[...panel.querySelector('#manual-services').selectedOptions].map(o=>o.value),paymentStatus:panel.querySelector('#manual-payment').value,priceAdjustmentPence:Math.round(Number(panel.querySelector('#manual-adjustment').value||0)*100),addons:Object.fromEntries(ACTION_ADDONS.map(a=>[a[0],Number(panel.querySelector('#manual-'+a[0]).value||0)]))};
      try{await api(BOOKING_API,'/api/manual-booking',{method:'POST',body:JSON.stringify(body)});msg.textContent='Booking created.';msg.className='msg success';setTimeout(()=>{panel.remove();loadBookings()},400)}catch(e){msg.textContent=e.message;msg.className='msg error'}
    };
  }

  function addTreatmentUI(){
    const clientsView=document.querySelector('#clients');
    if(!clientsView || document.querySelector('#completedTreatmentPanel')) return;
    const toolbar=clientsView.querySelector('.toolbar');
    if(!toolbar) return;
    const button=document.createElement('button');button.className='button secondary';button.id='recordTreatment';button.textContent='Record treatment';toolbar.appendChild(button);
    button.onclick=()=>{
      if(!window.clients?.length){alert('Load your client list first.');return;}
      const panel=document.createElement('section');panel.id='completedTreatmentPanel';panel.className='panel';panel.style.marginTop='18px';
      panel.innerHTML=`<div class="kicker">Treatment history</div><h2>Record completed treatment</h2><p class="muted">For treatments carried out outside the online booking flow. This is added to the selected client’s history and payment records.</p><div class="form-grid"><div class="field"><label>Client</label><select id="treat-client"><option value="">Choose client…</option>${clientOptions()}</select></div><div class="field"><label>Date</label><input id="treat-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Time (optional)</label><input id="treat-time" type="time"></div><div class="field"><label>Payment</label><select id="treat-payment"><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="refunded">Refunded</option><option value="not-required">Not required</option></select></div><div class="field"><label>Price adjustment (£)</label><input id="treat-adjustment" type="number" step="0.01" value="0"></div></div><div class="field" style="margin-top:12px"><label>Treatments</label><select id="treat-services" multiple size="7">${serviceOptions()}</select></div><div class="form-grid" style="margin-top:12px">${addonFields('treat')}</div><div class="field" style="margin-top:12px"><label>Notes</label><textarea id="treat-notes" maxlength="2000" placeholder="Optional treatment notes"></textarea></div><div class="actions"><button class="button" id="treat-save">Record treatment</button><button class="button secondary" id="treat-close">Close</button><span class="msg" id="treat-msg"></span></div>`;
      clientsView.querySelector('#clientTable').parentElement.insertAdjacentElement('afterend',panel);
      panel.querySelector('#treat-close').onclick=()=>panel.remove();
      panel.querySelector('#treat-save').onclick=async()=>{
        const msg=panel.querySelector('#treat-msg');msg.textContent='';
        const body={clientId:panel.querySelector('#treat-client').value,date:panel.querySelector('#treat-date').value,time:panel.querySelector('#treat-time').value,services:[...panel.querySelector('#treat-services').selectedOptions].map(o=>o.value),paymentStatus:panel.querySelector('#treat-payment').value,priceAdjustmentPence:Math.round(Number(panel.querySelector('#treat-adjustment').value||0)*100),addons:Object.fromEntries(ACTION_ADDONS.map(a=>[a[0],Number(panel.querySelector('#treat-'+a[0]).value||0)])),notes:panel.querySelector('#treat-notes').value};
        try{const result=await api(BOOKING_API,'/api/completed-treatment',{method:'POST',body:JSON.stringify(body)});msg.textContent='Treatment recorded.';msg.className='msg success';setTimeout(()=>{panel.remove();loadClients();if(result.treatment?.id && body.clientId)showHistory(body.clientId)},400)}catch(e){msg.textContent=e.message;msg.className='msg error'}
      };
    };
  }

  function refreshClientSelects(){
    ['manual-client','treat-client'].forEach(id=>{const el=document.getElementById(id);if(el && window.clients?.length)el.innerHTML='<option value="">Choose client…</option>'+clientOptions()});
  }
  function init(){
    addBookingUI();addTreatmentUI();refreshClientSelects();
    const oldLoadClients=window.loadClients;
    if(typeof oldLoadClients==='function' && !window.__studioWrappedClients){
      window.__studioWrappedClients=true;
      window.loadClients=async()=>{await oldLoadClients();refreshClientSelects()};
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.addEventListener('hashchange',()=>setTimeout(init,50));
})();
