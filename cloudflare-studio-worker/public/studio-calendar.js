(() => {
  const API='https://studio-booking-api.autumnnails.com';
  const rootId='studioCalendar';
  const pad=n=>String(n).padStart(2,'0');
  const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseDate=s=>{const [y,m,d]=String(s||'').split('-').map(Number);return y?new Date(y,m-1,d):null};
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  const money=p=>'£'+(Number(p||0)/100).toFixed(2);
  const fmtTime=t=>String(t||'').slice(0,5);
  const fmtSlotDate=iso=>{const [y,m,d]=String(iso||'').split('-');return y&&m&&d?`${d}/${m}/${String(y).slice(-2)}`:''};
  const readSlotDate=value=>{const v=String(value||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const match=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);if(!match)return '';let [,d,m,y]=match;if(y.length===2)y=`20${y}`;return `${y}-${pad(Number(m))}-${pad(Number(d))}`};
  const setSlotDate=iso=>{const el=document.getElementById('slotDate');if(!el)return;el.type='text';el.inputMode='numeric';el.placeholder='DD/MM/YY';el.value=fmtSlotDate(iso)};
  const scrollToSlot=()=>{const target=document.getElementById('addSlot');if(!target)return;const top=target.getBoundingClientRect().top+window.scrollY-220;window.scrollTo({top:Math.max(0,top),behavior:'smooth'})};
  async function api(path){const r=await fetch(API+path,{credentials:'include',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Could not load calendar');return d}
  const state={week:(()=>{const x=new Date();x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x})(),selected:new Date(),availability:[],bookings:[]};
  function bookingName(b){return `${b.first_name||''} ${b.surname||''}`.trim()||'Booked'}
  function services(b){return (b.selectedServices||[]).map(x=>String(x).replaceAll('-',' ')).join(', ')||b.service_id||'Appointment'}
  function mins(t){const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m}
  function eventClass(status){return status==='cancelled'?' cancelled':status==='completed'?' completed':''}
  async function releaseAvailability(){
    const msg=document.getElementById('slotMsg');
    const date=readSlotDate(document.getElementById('slotDate')?.value);
    const startTime=document.getElementById('slotTime')?.value||'';
    const services=[...(document.getElementById('slotServices')?.selectedOptions||[])].map(o=>o.value);
    if(!date||!startTime){if(msg)msg.textContent='Please enter a valid date and time.';return}
    if(msg)msg.textContent='Releasing…';
    try{
      const body=new URLSearchParams({date,startTime,serviceIds:JSON.stringify(services)});
      const r=await fetch(API+'/api/availability',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body,credentials:'include',cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(d.error||'Could not release this appointment space.');
      if(msg)msg.textContent='Slot released.';
      await load();
      if(typeof window.loadBookings==='function'){try{await window.loadBookings()}catch{}}
    }catch(e){if(msg)msg.textContent=e.message||'Could not release this appointment space.'}
  }
  function install(){
    const bookings=document.querySelector('#bookings');
    if(!bookings)return false;
    let section=document.getElementById(rootId);
    if(!section){const hero=bookings.querySelector('.hero');if(!hero)return false;section=document.createElement('section');section.id=rootId;section.className='studio-calendar-shell';hero.insertAdjacentElement('afterend',section)}
    if(!section.querySelector('[data-cal-grid]'))section.innerHTML=`<div class="studio-calendar-head"><div><div class="kicker">Your diary</div><h2>Weekly calendar</h2><p class="muted">Booked appointments and released spaces, together.</p></div><div class="studio-calendar-controls"><button class="button secondary" data-cal-prev>‹ Previous</button><button class="button secondary" data-cal-today>Today</button><button class="button secondary" data-cal-next>Next ›</button><button class="button" data-cal-add>+ Release availability</button></div></div><div class="studio-calendar-summary" data-cal-summary></div><div class="studio-calendar-wrap"><div class="studio-calendar" data-cal-grid></div></div><div class="studio-calendar-key"><span><i class="cal-dot available"></i> Available</span><span><i class="cal-dot booked"></i> Booked</span><span><i class="cal-dot empty"></i> Empty</span></div>`;
    section.querySelector('[data-cal-prev]').onclick=()=>{state.week=addDays(state.week,-7);render()};
    section.querySelector('[data-cal-next]').onclick=()=>{state.week=addDays(state.week,7);render()};
    section.querySelector('[data-cal-today]').onclick=()=>{state.week=startOfWeek(new Date());state.selected=new Date();render()};
    section.querySelector('[data-cal-add]').onclick=()=>{state.selected=new Date();setSlotDate(dateKey(state.selected));scrollToSlot()};
    const add=document.getElementById('addSlot');
    if(add&&!add.dataset.calendarAvailabilityBound){add.dataset.calendarAvailabilityBound='1';add.onclick=releaseAvailability}
    const date=document.getElementById('slotDate');
    if(date){const current=readSlotDate(date.value)||dateKey(new Date());date.type='text';date.inputMode='numeric';date.placeholder='DD/MM/YY';date.value=fmtSlotDate(current)}
    return true;
  }
  function startOfWeek(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
  function render(){
    const grid=document.querySelector('[data-cal-grid]');const summary=document.querySelector('[data-cal-summary]');if(!grid)return;
    const days=Array.from({length:7},(_,i)=>addDays(state.week,i));const from=dateKey(days[0]),to=dateKey(days[6]);
    const all=[...state.bookings.map(b=>({...b,_type:'booked'})),...state.availability.map(s=>({...s,_type:'available'}))].filter(x=>x.date>=from&&x.date<=to);
    const booked=all.filter(x=>x._type==='booked'&&x.status!=='cancelled').length;const available=all.filter(x=>x._type==='available'&&x.status!=='booked').length;
    const value=state.bookings.filter(b=>b.date>=from&&b.date<=to&&b.status!=='cancelled').reduce((n,b)=>n+Number(b.finalPricePence??b.price_pence??0),0);
    summary.innerHTML=`<div><strong>${booked}</strong><span>Booked</span></div><div><strong>${available}</strong><span>Available</span></div><div><strong>${booked+available}</strong><span>Spaces shown</span></div><div><strong>${money(value)}</strong><span>Booked value</span></div>`;
    grid.innerHTML=`<div class="cal-time-head">${days[0].toLocaleDateString('en-GB',{month:'long'})}</div>${days.map(d=>`<div class="cal-day-head ${dateKey(d)===dateKey(new Date())?'today':''}"><strong>${d.toLocaleDateString('en-GB',{weekday:'short'})}</strong><span>${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></div>`).join('')}<div class="cal-time-column">${Array.from({length:17},(_,i)=>`<div>${pad(6+i)}:00</div>`).join('')}</div>${days.map(d=>dayColumn(d,all)).join('')}`;
    grid.querySelectorAll('[data-booking-id]').forEach(el=>el.onclick=()=>{const id=el.dataset.bookingId;const btn=document.querySelector(`[data-edit-booking="${CSS.escape(id)}"]`);if(btn)btn.click();else alert('Open the booking below to edit it.')});
    grid.querySelectorAll('[data-available-id]').forEach(el=>el.onclick=()=>{const row=document.querySelector(`[data-edit-availability="${CSS.escape(el.dataset.availableId)}"]`);if(row)row.click();else alert('This released space can still be managed in Availability below.')});
    grid.querySelectorAll('[data-empty-date]').forEach(el=>el.onclick=()=>{state.selected=parseDate(el.dataset.emptyDate);setSlotDate(el.dataset.emptyDate);scrollToSlot()});
  }
  function dayColumn(d,all){const key=dateKey(d);const items=all.filter(x=>x.date===key).sort((a,b)=>mins(a.start_time)-mins(b.start_time));return `<div class="cal-day ${key===dateKey(new Date())?'today':''}">${Array.from({length:17},(_,i)=>`<div class="cal-hour" data-empty-date="${key}" style="top:${i*60}px"></div>`).join('')}${items.map(x=>{const top=Math.max(0,(mins(x.start_time)-360)/60);if(x._type==='booked')return `<button type="button" class="cal-event booked${eventClass(x.status)}" data-booking-id="${esc(x.id)}" style="top:${top}px"><b>${esc(fmtTime(x.start_time))}</b><strong>${esc(bookingName(x))}</strong><span>${esc(services(x))}</span><small>${esc(x.status||'confirmed')} · ${money(x.finalPricePence??x.price_pence)}</small></button>`;return `<button type="button" class="cal-event available" data-available-id="${esc(x.id)}" style="top:${top}px"><b>${esc(fmtTime(x.start_time))}</b><strong>Available</strong><span>${esc((x.services||x.service_ids||[]).join(', ').replaceAll('-',' '))}</span></button>`}).join('')}</div>`}
  async function load(){try{const [a,b]=await Promise.all([api('/api/availability'),api('/api/bookings')]);state.availability=a.slots||[];state.bookings=b.bookings||[];render()}catch(e){const g=document.querySelector('[data-cal-grid]');if(g)g.innerHTML=`<div class="cal-error">${esc(e.message)}</div>`}}
  async function renderWhenReady(){if(!install())return;await load()}
  const css=document.createElement('style');css.textContent=`#studioCalendar{margin:0 0 22px;background:rgba(255,250,246,.93);border:1px solid white;box-shadow:var(--shadow);border-radius:24px;padding:24px}.studio-calendar-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:18px}.studio-calendar-head h2{font:400 2rem Georgia,serif;margin:0 0 5px}.studio-calendar-head p{margin:0}.studio-calendar-controls{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.studio-calendar-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}.studio-calendar-summary>div{background:white;border:1px solid var(--line);border-radius:16px;padding:12px 15px}.studio-calendar-summary strong{display:block;font:400 1.45rem Georgia,serif}.studio-calendar-summary span{font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink2)}.studio-calendar-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:white}.studio-calendar{min-width:930px;display:grid;grid-template-columns:70px repeat(7,minmax(120px,1fr));position:relative}.cal-time-head{grid-column:1;background:#fffaf6;border-bottom:1px solid var(--line);padding:14px 8px;font-size:.65rem;text-transform:uppercase;color:var(--ink2)}.cal-day-head{background:#fffaf6;border-left:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px;text-align:center}.cal-day-head strong,.cal-day-head span{display:block}.cal-day-head strong{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em}.cal-day-head span{font-size:.9rem;margin-top:3px}.cal-day-head.today{box-shadow:inset 0 -3px 0 var(--terracotta)}.cal-time-column{position:relative;height:1020px;background:#fffaf6}.cal-time-column div{height:60px;border-bottom:1px solid var(--line);padding:6px 7px;font-size:.62rem;color:#9a786d}.cal-day{height:1020px;position:relative;border-left:1px solid var(--line);background:repeating-linear-gradient(to bottom,transparent 0,transparent 59px,var(--line) 60px)}.cal-day.today{background-color:rgba(243,230,223,.18)}.cal-hour{position:absolute;left:0;right:0;height:60px;cursor:pointer}.cal-event{position:absolute;left:5px;right:5px;min-height:52px;border-radius:12px;padding:7px 9px;text-align:left;overflow:hidden;z-index:2;cursor:pointer;box-shadow:0 5px 14px rgba(90,48,40,.08)}.cal-event b,.cal-event strong,.cal-event span,.cal-event small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cal-event b{font-size:.62rem;letter-spacing:.06em}.cal-event strong{font-size:.8rem;margin-top:2px}.cal-event span{font-size:.68rem;margin-top:2px}.cal-event small{font-size:.6rem;margin-top:3px;text-transform:capitalize}.cal-event.booked{background:#f3e6df;border:1px solid rgba(100,52,45,.12);color:var(--ink)}.cal-event.booked.completed{background:#e9eee5}.cal-event.booked.cancelled{opacity:.55;text-decoration:line-through}.cal-event.available{background:#eef0e8;border:1px solid rgba(100,110,75,.18);color:#59604b}.studio-calendar-key{display:flex;gap:18px;margin-top:12px;color:var(--ink2);font-size:.72rem}.studio-calendar-key span{display:flex;gap:6px;align-items:center}.cal-dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:#ddd}.cal-dot.available{background:#a9aa93}.cal-dot.booked{background:#bf7054}.cal-dot.empty{background:#ddd}.cal-error{padding:40px;text-align:center;color:#9b3d32;grid-column:1/-1}@media(max-width:760px){#studioCalendar{padding:18px}.studio-calendar-head{align-items:flex-start;flex-direction:column}.studio-calendar-controls{justify-content:flex-start}.studio-calendar-summary{grid-template-columns:repeat(2,1fr)}}`;
  document.head.appendChild(css);
  const obs=new MutationObserver(()=>{if((location.hash==='#bookings'||document.querySelector('#bookings.active'))&&!document.getElementById(rootId))renderWhenReady()});
  obs.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{if(location.hash==='#bookings')setTimeout(renderWhenReady,20)});
  if(location.hash==='#bookings'||document.querySelector('#bookings.active'))setTimeout(renderWhenReady,20);
  const arrangeBookings=()=>{
    const bookings=document.querySelector('#bookings');
    if(!bookings||!document.getElementById(rootId))return;
    const hero=bookings.querySelector('.hero');
    const calendar=document.getElementById(rootId);
    const grid=hero?.nextElementSibling===calendar?calendar.nextElementSibling:bookings.querySelector('.grid');
    const availability=bookings.querySelector('#availability')?.closest('.panel');
    const bookingTable=bookings.querySelector('#bookingTable')?.closest('.panel');
    const manual=bookings.querySelector('#manualBookingPanel');
    if(calendar&&hero&&hero.nextElementSibling!==calendar)hero.insertAdjacentElement('afterend',calendar);
    if(grid&&calendar&&calendar.nextElementSibling!==grid)calendar.insertAdjacentElement('afterend',grid);
    if(availability&&grid&&availability.previousElementSibling!==grid)grid.insertAdjacentElement('afterend',availability);
    if(bookingTable&&availability&&availability.nextElementSibling!==bookingTable)availability.insertAdjacentElement('afterend',bookingTable);
    if(manual&&bookingTable&&manual.previousElementSibling!==bookingTable)bookingTable.insertAdjacentElement('afterend',manual);
  };
  const layoutObserver=new MutationObserver(()=>{if(location.hash==='#bookings'||document.querySelector('#bookings.active'))arrangeBookings()});
  layoutObserver.observe(document.body,{childList:true,subtree:true});
  setTimeout(arrangeBookings,80);
})();