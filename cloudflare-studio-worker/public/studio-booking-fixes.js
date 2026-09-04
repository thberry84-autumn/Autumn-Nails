(() => {
  const API = 'https://studio-booking-api.autumnnails.com';
  const MIN_TIME = '18:00';
  const MAX_TIME = '22:00';

  function patchTimePickers() {
    document.querySelectorAll('input[type="time"]').forEach(input => {
      input.min = MIN_TIME;
      input.max = MAX_TIME;
      if (!input.value || input.value < MIN_TIME || input.value > MAX_TIME) input.value = MIN_TIME;

      const wrap = input.closest('.time-picker-wrap');
      if (!wrap) return;

      wrap.querySelectorAll('.time-choice').forEach(button => {
        const value = String(button.dataset.time || '').slice(0, 5);
        button.hidden = !/^\d{2}:\d{2}$/.test(value) || value < MIN_TIME || value > MAX_TIME;
      });

      const picker = wrap.querySelector('.time-picker-popover');
      if (picker) {
        const visible = picker.querySelectorAll('.time-choice:not([hidden])');
        if (!visible.length) picker.hidden = true;
      }

      const button = wrap.querySelector('.time-picker-button');
      if (button && (!button.textContent || button.textContent === 'Choose time' || button.textContent < MIN_TIME || button.textContent > MAX_TIME)) {
        button.textContent = input.value || MIN_TIME;
      }
    });
  }

  function getBookingId(row) {
    const edit = row.querySelector('[data-edit-booking]');
    if (edit?.dataset.editBooking) return edit.dataset.editBooking;
    const select = row.querySelector('select[onchange*="changeBooking"]');
    const source = String(select?.getAttribute('onchange') || '');
    const match = source.match(/changeBooking\(['\"]([^'\"]+)['\"]/);
    return match ? match[1] : '';
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
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
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
      const id = getBookingId(row);
      if (!id) return;

      const select = row.querySelector('select[onchange*="changeBooking"]');
      const cell = select?.parentElement || row.lastElementChild;
      if (!cell) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary';
      button.textContent = 'Cancel';
      button.style.marginLeft = '7px';
      button.addEventListener('click', () => cancelBooking(id));
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
