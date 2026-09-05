(() => {
  const API='https://studio-booking-api.autumnnails.com';

  const install=()=>{
    const button=document.getElementById('addSlot');
    if(button&&!button.dataset.calendarAvailabilityBound&&button.dataset.sameOriginAvailability!=='1'){button.dataset.sameOriginAvailability='1'}
    installEditor();
    installUkDateFields();
  };

  const installUkDateFields=()=>{
    document.querySelectorAll('input[type="date"]:not([data-uk-date-enhanced])').forEach(input=>{
      input.dataset.ukDateEnhanced='1';
      input.lang='en-GB';
      const wrap=document.createElement('div');
      wrap.className='uk-date-picker-wrap';
      input.parentNode.insertBefore(wrap,input);
      wrap.appendChild(input);
      const display=document.createElement('div');
      display.className='uk-date-display';
      wrap.insertBefore(display,input);
      const format=value=>{
        if(!value)return '';
        const parts=value.split('-');
        if(parts.length!==3)return value;
        return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
      };
      const sync=()=>{display.textContent=format(input.value)};
      input.style.position='absolute';
      input.style.inset='0';
      input.style.width='100%';
      input.style.height='100%';
      input.style.opacity='0';
      input.style.cursor='pointer';
      input.style.zIndex='2';
      input.addEventListener('change',sync);
      wrap.addEventListener('click',()=>{try{if(typeof input.showPicker==='function')input.showPicker()}catch{}});
      sync();
    });
  };

  const installEditor=()=>{
    if(document.getElementById('studio-availability-editor-style'))return;
    const style=document.createElement('style');
    style.id='studio-availability-editor-style';
    style.textContent=`
      .studio-calendar-key .cal-dot.empty{width:9px!important;height:9px!important;min-width:9px!important;min-height:9px!important;border:1px solid var(--ink2)!important;background:white!important;box-sizing:border-box!important;}
      .uk-date-picker-wrap{position:relative!important;width:100%!important;box-sizing:border-box!important;}
      .uk-date-picker-wrap .uk-date-display{display:flex!important;align-items:center!important;width:100%!important;box-sizing:border-box!important;padding:13px 14px!important;line-height:normal!important;border:1px solid var(--line)!important;border-radius:14px!important;background:rgba(255,255,255,.72)!important;color:var(--espresso)!important;overflow:hidden!important;}
      .uk-date-picker-wrap input[type="date"]{box-sizing:border-box!important;height:100%!important;min-height:0!important;max-height:none!important;}
      .uk-date-picker-wrap:hover .uk-date-display{border-color:rgba(196,106,43,.35);}
      .uk-date-picker-wrap:focus-within .uk-date-display{border-color:rgba(196,106,43,.5);box-shadow:0 0 0 3px rgba(196,106,43,.08);}
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
        installUkDateFields();
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
      installUkDateFields();
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