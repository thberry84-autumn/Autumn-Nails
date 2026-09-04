(() => {
  const API = 'https://studio-booking-api.autumnnails.com';
  const moneyToPence = value => Math.round((Number(value) || 0) * 100);
  const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  const money = pence => '£' + (Number(pence || 0) / 100).toFixed(2);

  async function request(path, options = {}) {
    if (typeof window.api === 'function') return window.api(API, path, options);
    const response = await fetch(API + path, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function closeModal(modal, button) { modal?.remove(); if (button) button.disabled = false; }

  function openAmendModal({ bookingId, client, date, originalPence, adjustmentText, paymentText, button }) {
    if (document.querySelector('.finance-amend-backdrop')) return;
    button.disabled = true;
    const currentAdjustment = Number(adjustmentText.replace(/£/g, '').trim()) || 0;
    const currentPayment = ['unpaid','paid','refunded','not-required'].includes(paymentText) ? paymentText : 'unpaid';
    const backdrop = document.createElement('div');
    backdrop.className = 'finance-amend-backdrop';
    backdrop.innerHTML = `
      <section class="finance-amend-modal" role="dialog" aria-modal="true" aria-labelledby="finance-amend-title">
        <div class="finance-amend-dialog">
          <button type="button" class="finance-amend-close" aria-label="Close">×</button>
          <div class="kicker">Payment</div>
          <h2 id="finance-amend-title">Amend payment</h2>
          <p class="muted">Adjust the final charge or update the payment status for this booking.</p>
          <div class="finance-amend-summary"><strong>${escapeHtml(client)}</strong><br>${escapeHtml(date)} · Original charge ${money(originalPence)}</div>
          <div class="finance-amend-fields">
            <label>Adjustment £<input class="finance-adjustment" type="number" step="0.01" value="${escapeHtml(currentAdjustment.toFixed(2))}" inputmode="decimal" autocomplete="off"></label>
            <label>Payment<select class="finance-payment">
              <option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option><option value="not-required">Not required</option>
            </select></label>
          </div>
          <div class="finance-amend-preview"><span>Final charge</span><strong class="finance-final-preview">${money(originalPence + moneyToPence(currentAdjustment))}</strong></div>
          <div class="actions"><span class="msg finance-amend-msg"></span><button type="button" class="button secondary finance-cancel">Cancel</button><button type="button" class="button finance-save">Save changes</button></div>
        </div>
      </section>`;
    document.body.appendChild(backdrop);

    const input = backdrop.querySelector('.finance-adjustment');
    const payment = backdrop.querySelector('.finance-payment');
    const preview = backdrop.querySelector('.finance-final-preview');
    const save = backdrop.querySelector('.finance-save');
    const cancel = backdrop.querySelector('.finance-cancel');
    const close = backdrop.querySelector('.finance-amend-close');
    const message = backdrop.querySelector('.finance-amend-msg');
    payment.value = currentPayment;

    const updatePreview = () => preview.textContent = money(originalPence + moneyToPence(input.value));
    const selectAmount = () => requestAnimationFrame(() => { input.focus(); input.select(); });
    input.addEventListener('focus', () => requestAnimationFrame(() => input.select()));
    input.addEventListener('input', updatePreview);
    const dismiss = () => closeModal(backdrop, button);
    close.addEventListener('click', dismiss);
    cancel.addEventListener('click', dismiss);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) dismiss(); });
    document.addEventListener('keydown', function onKey(event) { if (event.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); } }, { once: true });

    save.addEventListener('click', async () => {
      const adjustmentPence = moneyToPence(input.value);
      if (!Number.isFinite(adjustmentPence) || adjustmentPence < -100000 || adjustmentPence > 100000) {
        message.textContent = 'Enter an adjustment between -£1,000 and £1,000.';
        return;
      }
      save.disabled = true; cancel.disabled = true; close.disabled = true; message.textContent = 'Saving…';
      try {
        await request('/api/bookings/' + encodeURIComponent(bookingId) + '/payment', { method: 'PATCH', body: JSON.stringify({ priceAdjustmentPence: adjustmentPence, paymentStatus: payment.value }) });
        backdrop.remove(); button.disabled = false;
        if (typeof window.loadFinance === 'function') window.loadFinance(); else window.location.reload();
      } catch (error) {
        message.textContent = error.message || 'Could not save changes.';
        save.disabled = false; cancel.disabled = false; close.disabled = false;
      }
    });
    selectAmount();
  }

  async function enhanceFinance() {
    const host = document.getElementById('financeTable');
    const table = host?.querySelector('table');
    if (!table || table.dataset.amendReady === '1') return;
    const finance = await request('/api/finance').catch(error => { console.warn('Studio finance amendments could not load booking IDs', error); return null; });
    const rows = finance?.rows || [];
    const header = table.querySelector('thead tr');
    if (!header) return;
    if (![...header.children].some(cell => cell.textContent.trim() === 'Actions')) { const th = document.createElement('th'); th.textContent = 'Actions'; header.appendChild(th); }
    [...table.querySelectorAll('tbody tr')].forEach((row, index) => {
      if (row.dataset.amendButton === '1') return;
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 6) return;
      const bookingId = rows[index]?.id;
      const actionCell = document.createElement('td'); actionCell.className = 'finance-actions'; row.appendChild(actionCell);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary'; button.textContent = 'Amend'; button.disabled = !bookingId;
      if (!bookingId) button.title = 'Booking record could not be matched.';
      actionCell.appendChild(button); row.dataset.amendButton = '1';
      if (!bookingId) return;
      button.addEventListener('click', () => openAmendModal({ bookingId, client: cells[1].textContent.trim(), date: cells[0].textContent.trim(), originalPence: moneyToPence(cells[2].textContent.trim().replace(/£/g, '')), adjustmentText: cells[3].textContent.trim(), paymentText: cells[5].textContent.trim().toLowerCase(), button }));
    });
    table.dataset.amendReady = '1';
  }
  const observer = new MutationObserver(() => enhanceFinance());
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceFinance();
})();
