(() => {
  const API = 'https://studio-booking-api.autumnnails.com';
  const moneyToPence = value => Math.round((Number(value) || 0) * 100);
  const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');

  async function request(path, options = {}) {
    if (typeof window.api === 'function') return window.api(API, path, options);
    const response = await fetch(API + path, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  async function enhanceFinance() {
    const host = document.getElementById('financeTable');
    const table = host?.querySelector('table');
    if (!table || table.dataset.amendReady === '1') return;

    const finance = await request('/api/finance').catch(error => {
      console.warn('Studio finance amendments could not load booking IDs', error);
      return null;
    });
    const rows = finance?.rows || [];
    const header = table.querySelector('thead tr');
    if (!header) return;

    const existingActionHeader = [...header.children].find(cell => cell.textContent.trim() === 'Actions');
    if (!existingActionHeader) {
      const th = document.createElement('th');
      th.textContent = 'Actions';
      header.appendChild(th);
    }

    const bodyRows = [...table.querySelectorAll('tbody tr')];
    bodyRows.forEach((row, index) => {
      if (row.dataset.amendButton === '1') return;
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 6) return;

      const financeRow = rows[index];
      const bookingId = financeRow?.id;
      const actionCell = document.createElement('td');
      actionCell.className = 'finance-actions';
      row.appendChild(actionCell);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary';
      button.textContent = 'Amend';
      button.disabled = !bookingId;
      if (!bookingId) button.title = 'Booking record could not be matched.';
      actionCell.appendChild(button);
      row.dataset.amendButton = '1';

      if (!bookingId) return;

      button.addEventListener('click', () => {
        if (actionCell.querySelector('.finance-amend')) return;
        button.disabled = true;

        const adjustmentText = cells[3].textContent.trim().replace(/£/g, '');
        const paymentText = cells[5].textContent.trim().toLowerCase();
        const editor = document.createElement('div');
        editor.className = 'finance-amend';
        editor.innerHTML = `
          <div class="finance-amend-grid">
            <label>Adjustment £<input class="finance-adjustment" type="number" step="0.01" value="${escapeHtml(adjustmentText)}"></label>
            <label>Payment<select class="finance-payment">
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="not-required">Not required</option>
            </select></label>
            <div class="finance-amend-buttons"><button type="button" class="button finance-save">Save</button><button type="button" class="button secondary finance-cancel">Cancel</button></div>
            <span class="msg finance-amend-msg"></span>
          </div>`;
        actionCell.appendChild(editor);

        const payment = editor.querySelector('.finance-payment');
        payment.value = ['unpaid','paid','refunded','not-required'].includes(paymentText) ? paymentText : 'unpaid';
        const input = editor.querySelector('.finance-adjustment');
        const save = editor.querySelector('.finance-save');
        const cancel = editor.querySelector('.finance-cancel');
        const message = editor.querySelector('.finance-amend-msg');

        cancel.addEventListener('click', () => {
          editor.remove();
          button.disabled = false;
        });

        save.addEventListener('click', async () => {
          const adjustmentPence = moneyToPence(input.value);
          if (!Number.isFinite(adjustmentPence) || adjustmentPence < -100000 || adjustmentPence > 100000) {
            message.textContent = 'Enter an adjustment between -£1,000 and £1,000.';
            return;
          }
          save.disabled = true;
          cancel.disabled = true;
          message.textContent = 'Saving…';
          try {
            await request('/api/bookings/' + encodeURIComponent(bookingId), {
              method: 'PATCH',
              body: JSON.stringify({ priceAdjustmentPence: adjustmentPence, paymentStatus: payment.value })
            });
            editor.remove();
            button.disabled = false;
            if (typeof window.loadFinance === 'function') window.loadFinance();
            else window.location.reload();
          } catch (error) {
            message.textContent = error.message || 'Could not save changes.';
            save.disabled = false;
            cancel.disabled = false;
          }
        });
      });
    });

    table.dataset.amendReady = '1';
  }

  const observer = new MutationObserver(() => enhanceFinance());
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceFinance();
})();
