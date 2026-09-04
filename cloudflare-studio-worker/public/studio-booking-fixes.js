(() => {
  const API = 'https://studio-booking-api.autumnnails.com';
  const pad = n => String(n).padStart(2, '0');

  function patchTimePickers() {
    document.querySelectorAll('input[type="time"]').forEach(input => {
      input.min = '18:00';
      input.max = '22:00';
      const wrap = input.closest('.time-picker-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.time-choice').forEach(button => {
        const value = button.dataset.time || '';
        button.hidden = value < '18:00' || value > '22:00';
      });
      const picker = wrap.querySelector('.time-picker-popover');
      if (picker && !picker.querySelector('.time-choice:not([hidden])')) {
        picker.hidden = true;
      }
    });
  }

  async function cancelBooking(id) {
    if (!id) return;
    if (!window.confirm('Cancel this appointment? The released space will become available again.')) return;
    try {
      const response = await fetch(`${API}/api/bookings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not cancel appointment (${response.status})`);
      if (typeof window.loadBookings === 'function') await window.loadBookings();
      else location.hash = '#bookings';
    } catch (error) {
      window.alert(error?.message || 'Could not cancel appointment.');
    }
  }

  function addCancelButtons() {
    document.querySelectorAll('#bookingTable tbody tr').forEach(row => {
      if (row.dataset.cancelFix === '1') return;
      const select = row.querySelector('select[onchange*="changeBooking"]');
      if (!select) return;
      const match = String(select.getAttribute('onchange') || '').match(/changeBooking\(['\"]([^'\"]+)/);
      if (!match) return;
      const id = match[1];
      const cell = select.parentElement;
      if (!cell) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary';
      button.textContent = 'Cancel';
      button.style.marginLeft = '7px';
      button.onclick = () => cancelBooking(id);
      cell.appendChild(button);
      row.dataset.cancelFix = '1';
    });
  }

  function boot() {
    patchTimePickers();
    addCancelButtons();
  }

  const observer = new MutationObserver(boot);
  observer.observe(document.body, { childList: true, subtree: true });
  boot();
})();
