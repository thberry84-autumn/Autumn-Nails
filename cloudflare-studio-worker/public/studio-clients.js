(() => {
  const API = '/api/studio/clients';
  const services = {
    escape(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); },
    money(pence) { return '£' + (Number(pence || 0) / 100).toFixed(2); }
  };
  let clients = [];
  let currentId = null;
  let ready = false;
  const $ = id => document.getElementById(id);

  async function request(path, options = {}) {
    const response = await fetch(API + path, { ...options, credentials:'include', cache:'no-store', headers:{'Content-Type':'application/json', ...(options.headers||{})} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Client request failed.');
    return data;
  }

  function closePanels() {
    $('clientEdit')?.classList.add('hidden');
    $('history')?.classList.add('hidden');
  }

  function scrollToPanel(panel) {
    if (!panel) return;
    requestAnimationFrame(() => setTimeout(() => {
      const top = panel.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
    }, 40));
  }

  function render() {
    const host = $('clientTable');
    if (!host) return;
    const query = String($('clientSearch')?.value || '').trim().toLowerCase();
    const rows = clients.filter(c => (`${c.first_name} ${c.surname} ${c.email} ${c.phone}`).toLowerCase().includes(query));
    host.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Client</th><th>Contact</th><th>Bookings</th><th>Last booking</th><th>Marketing</th><th>Actions</th></tr></thead><tbody>${rows.map(c => `<tr><td><strong>${services.escape(c.first_name+' '+c.surname)}</strong></td><td>${services.escape(c.email)}<br>${services.escape(c.phone)}</td><td>${Number(c.booking_count||0)}</td><td>${services.escape(c.last_booking_date||'—')}</td><td>${c.marketing_opt_in ? '<span class="tag">Opted in</span>' : '—'}</td><td><div class="client-actions"><button type="button" class="button secondary" data-client-edit="${services.escape(c.id)}">Edit</button><button type="button" class="button" data-client-history="${services.escape(c.id)}">History</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No clients found.</div>';
  }

  async function load() {
    const host = $('clientTable');
    if (!host) return;
    host.innerHTML = '<div class="empty">Loading clients…</div>';
    try { const data = await request(''); clients = data.clients || []; render(); }
    catch (error) { host.innerHTML = `<div class="error">${services.escape(error.message)}</div>`; }
  }

  function openEditor(client = null) {
    currentId = client?.id || null;
    const panel = $('clientEdit');
    if (!panel) return;
    panel.classList.remove('hidden');
    $('history')?.classList.add('hidden');
    $('editFirst').value = client?.first_name || '';
    $('editSurname').value = client?.surname || '';
    $('editEmail').value = client?.email || '';
    $('editPhone').value = client?.phone || '';
    $('editMarketing').checked = !!client?.marketing_opt_in;
    $('clientMsg').textContent = '';
    panel.querySelector('h2').textContent = currentId ? 'Edit client' : 'Add new client';
    scrollToPanel(panel);
    setTimeout(() => $('editFirst')?.focus(), 250);
  }

  async function save() {
    const msg = $('clientMsg');
    const body = { firstName:$('editFirst').value.trim(), surname:$('editSurname').value.trim(), email:$('editEmail').value.trim(), phone:$('editPhone').value.trim(), marketingOptIn:$('editMarketing').checked };
    if (!body.firstName || !body.surname || !body.email || !body.phone) { msg.textContent='Please complete all required details.'; msg.className='msg error'; return; }
    const button = $('saveClient'); button.disabled = true; msg.textContent='Saving…'; msg.className='msg';
    try {
      await request(currentId ? '/' + encodeURIComponent(currentId) : '', {method: currentId ? 'PATCH' : 'POST', body:JSON.stringify(body)});
      msg.textContent = currentId ? 'Client updated.' : 'Client added.'; msg.className='msg success';
      await load();
      setTimeout(() => { $('clientEdit').classList.add('hidden'); }, 350);
    } catch(error) { msg.textContent=error.message; msg.className='msg error'; }
    finally { button.disabled=false; }
  }

  async function history(id) {
    const panel = $('history');
    const list = $('historyList');
    if (!panel || !list) return;
    panel.classList.remove('hidden');
    $('clientEdit')?.classList.add('hidden');
    list.innerHTML = '<div class="empty">Loading history…</div>';
    scrollToPanel(panel);
    try {
      const data = await request('/' + encodeURIComponent(id) + '/history');
      $('historyTitle').textContent = `${data.client.first_name} ${data.client.surname}`;
      const rows = data.history || [];
      list.innerHTML = rows.length ? rows.map(row => `<div class="stat" style="margin-bottom:10px"><strong>${services.escape(row.date)} ${services.escape(row.start_time||'')}</strong><div class="muted">${services.escape(row.booked_service_id||row.service_id||'')} · ${services.money(row.final_price_pence ?? row.price_pence)} · ${services.escape(row.status)} · ${services.escape(row.payment_status||'unpaid')}</div>${row.metadata?.notes ? `<div class="note">${services.escape(row.metadata.notes)}</div>` : ''}</div>`).join('') : '<div class="empty">No treatment history recorded.</div>';
      scrollToPanel(panel);
    } catch(error) {
      list.innerHTML=`<div class="error">${services.escape(error.message)}</div>`;
      scrollToPanel(panel);
    }
  }

  function bind() {
    if (ready) return;
    const search = $('clientSearch'), add = $('newClient'), saveButton = $('saveClient'), close = $('closeClient'), table = $('clientTable');
    if (!table) return;
    ready = true;
    if (search) search.oninput = render;
    if (add) add.onclick = () => openEditor();
    if (saveButton) saveButton.onclick = save;
    if (close) close.onclick = () => $('clientEdit').classList.add('hidden');
    table.addEventListener('click', event => {
      const edit = event.target.closest('[data-client-edit]');
      if (edit) {
        event.preventDefault();
        const client = clients.find(c => c.id === edit.dataset.clientEdit);
        if (client) openEditor(client);
        return;
      }
      const hist = event.target.closest('[data-client-history]');
      if (hist) {
        event.preventDefault();
        history(hist.dataset.clientHistory);
      }
    });
  }

  window.editClient = id => { const client = clients.find(c => c.id === id); if (client) openEditor(client); };
  window.showHistory = history;
  window.studioClientsReload = load;
  const init = () => { if (location.hash.slice(1) === 'clients') { bind(); load(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('hashchange', () => { if (location.hash.slice(1) === 'clients') { closePanels(); init(); } });
})();
