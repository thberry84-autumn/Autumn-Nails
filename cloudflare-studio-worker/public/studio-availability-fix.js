(() => {
  const API='https://studio-booking-api.autumnnails.com';

  const postAvailability=async()=>{
    const msg=document.getElementById('slotMsg');
    const date=document.getElementById('slotDate')?.value||'';
    const startTime=document.getElementById('slotTime')?.value||'';
    const services=[...(document.getElementById('slotServices')?.selectedOptions||[])].map(o=>o.value);
    if(!date||!startTime){if(msg)msg.textContent='Please choose a date and time.';return}
    if(msg)msg.textContent='Releasing…';
    try{
      const response=await fetch('/api/studio/availability',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',cache:'no-store',body:JSON.stringify({date,startTime,serviceIds:services})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not release this appointment space.');
      if(msg)msg.textContent='Slot released.';
      if(typeof window.loadBookings==='function'){try{await window.loadBookings()}catch{}}
      document.dispatchEvent(new CustomEvent('studio-availability-changed'));
    }catch(error){if(msg)msg.textContent=error.message||'Could not release this appointment space.'}
  };

  const install=()=>{
    const button=document.getElementById('addSlot');
    if(button&&button.dataset.sameOriginAvailability!=='1'){button.dataset.sameOriginAvailability='1';button.onclick=postAvailability}
    installEditor();
  };

  const installEditor=()=>{
    if(document.getElementById('studio-availability-editor-style'))return;
    const style=document.createElement('style');
    style.id='studio-availability-editor-style';
    style.textContent=`
      .studio-calendar-key .cal-dot.empty{width:9px!important;height:9px!important;min-width:9px!important;min-height:9px!important;border:1px solid var(--ink2)!important;background:white!important;box-sizing:border-box!important;}
      #studioAvailabilityEditor{position:fixed;inset:0;z-index:9999;background:rgba(63,42,36,.24);display:flex;align-items:center;justify-content:center;padding:24px;}
      #studioAvailabilityEditor[hidden]{display:none!important;}
      #studioAvailabilityEditor .editor-card{width:min(440px,100%);background:#fffaf6;border:1px solid rgba(100,52,45,.12);border-radius:24px;padding:26px;box-shadow:0 20px 55px rgba(63,42,36,.18);}
      #studioAvailabilityEditor h3{font:400 1.8rem Georgia,serif;margin:0 0 6px;color:var(--ink);}
      #studioAvailabilityEditor .editor-kicker{font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:var(--terracotta);font-weight:700;margin-bottom:8px;}
      #studioAvailabilityEditor .editor-date{font-size:.88rem;color:var(--ink2);margin-bottom:20px;}
      #studioAvailabilityEditor label{display:block;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);font-weight:700;margin-bottom:7px;}
      #studioAvailabilityEditor input{width:100%;box-sizing:border-box;}
      #studioAvailabilityEditor .editor-actions{display:flex;gap:10px;align-items:center;margin-top:20px;}
      #studioAvailabilityEditor .editor-message{font-size:.78rem;color:#9b3d32;min-height:1em;margin-top:10px;}
    `;
    document.head.appendChild(style);
  };

  const getEditor=()=>document.getElementById('studioAvailabilityEditor');
  const closeEditor=()=>{const modal=getEditor();if(modal)modal.hidden=true};

  const openEditor=async id=>{
    if(!id)return;
    try{
      const response=await fetch(API+'/api/availability',{credentials:'include',cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not load appointment space.');
      const slot=(data.slots||[]).find(x=>String(x.id)===String(id));
      if(!slot)throw new Error('Appointment space not found.');
      let modal=getEditor();
      if(!modal){
        modal=document.createElement('div');
        modal.id='studioAvailabilityEditor';
        modal.hidden=true;
        modal.innerHTML=`<div class="editor-card" role="dialog" aria-modal="true" aria-labelledby="studioAvailabilityEditorTitle"><div class="editor-kicker">Edit availability</div><h3 id="studioAvailabilityEditorTitle">Appointment space</h3><div class="editor-date" data-editor-date></div><div class="field"><label for="editorSlotDate">Date</label><input id="editorSlotDate" type="date"></div><div class="field" style="margin-top:14px"><label for="editorSlotTime">Start time</label><input id="editorSlotTime" type="time" min="09:00" max="22:00" step="900"></div><div class="editor-message" data-editor-message></div><div class="editor-actions"><button type="button" class="button" data-editor-save>Update appointment time</button><button type="button" class="button secondary" data-editor-cancel>Cancel</button></div></div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click',e=>{if(e.target===modal)closeEditor()});
        modal.querySelector('[data-editor-cancel]').onclick=closeEditor;
        modal.querySelector('[data-editor-save]').onclick=async()=>{
          const message=modal.querySelector('[data-editor-message]');
          const date=modal.querySelector('#editorSlotDate').value;
          const startTime=modal.querySelector('#editorSlotTime').value;
          if(!date||!startTime){message.textContent='Please choose a valid date and time.';return}
          message.textContent='Saving…';
          const form=new URLSearchParams({date,startTime});
          try{
            const save=await fetch(`${API}/api/availability/${encodeURIComponent(modal.dataset.slotId)}/edit`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:form,credentials:'include',cache:'no-store'});
            const result=await save.json().catch(()=>({}));
            if(!save.ok)throw new Error(result.error||'Could not update this appointment space.');
            message.textContent='Updated.';
            setTimeout(()=>location.reload(),250);
          }catch(error){message.textContent=error.message||'Could not update this appointment space.'}
        };
      }
      modal.dataset.slotId=id;
      modal.querySelector('#editorSlotDate').value=slot.date||'';
      modal.querySelector('#editorSlotTime').value=String(slot.start_time||'').slice(0,5);
      modal.querySelector('[data-editor-date]').textContent=`${slot.date||''} · ${String(slot.start_time||'').slice(0,5)}`;
      modal.querySelector('[data-editor-message]').textContent='';
      modal.hidden=false;
      modal.querySelector('#editorSlotTime').focus();
    }catch(error){window.alert(error.message||'Could not edit this appointment space.')}
  };

  const editorClick=e=>{
    const event=e.target.closest('.cal-event.available[data-available-id]');
    if(!event)return;
    if(e.target.closest('.cal-action.remove'))return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openEditor(event.dataset.availableId);
  };

  document.addEventListener('click',editorClick,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
  new MutationObserver(install).observe(document.body,{childList:true,subtree:true});
})();
