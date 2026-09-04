(() => {
  const API = 'https://studio-booking-api.autumnnails.com';
  const MIN_TIME = '18:00';
  const MAX_TIME = '22:00';

  function installPickerVisibilityFix() {
    if (document.getElementById('studio-time-picker-visibility-fix')) return;
    const style = document.createElement('style');
    style.id = 'studio-time-picker-visibility-fix';
    style.textContent = '.time-picker-popover[hidden]{display:none!important;}';
    document.head.appendChild(style);
  }

  function patchTimePickers() {
    document.querySelectorAll('input[type="time"]').forEach(input => {
      input.min = MIN_TIME;
      input.max = MAX_TIME;
      input.step = 900;
      if (!input.value || input.value < MIN_TIME || input.value > MAX_TIME) input.value = MIN_TIME;

      const wrap = input.closest('.time-picker-wrap');
      if (!wrap) return;

      // The original picker creates a full 06:00–22:00 list. Remove the
      // out-of-hours choices rather than merely hiding them, so the custom
      // grid cannot leave empty/scrollable space for the old hours.
      wrap.querySelectorAll('.time-choice').forEach(button => {
        const value = String(button.dataset.time || '').slice(0, 5);
        if (!/^\d{2}:\d{2}$/.test(value) || value < MIN_TIME || value > MAX_TIME) {
          button.remove();
        }
      });

      const picker = wrap.querySelector('.time-picker-popover');
      if (picker) {
        picker.style.maxHeight = 'none';
        picker.style.overflow = 'visible';
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
      location.reload();
    } catch (error) {
      window.alert(error?.message || 'Could not cancel appointment.');
    }
  }

  async function removeAvailability(id) {
    if (!id) return;
    if (!window.confirm('Remove this appointment space? It will no longer be bookable.')) return;
    try {
      const response = await fetch(`${API}/api/availability/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        cache: 'no-store'
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!response.ok) throw new Error(data.error || `Could not remove appointment space (${response.status})`);
      location.reload();
    } catch (error) {
      window.alert(error?.message || 'Could not remove appointment space.');
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

  function addCalendarRemoveHandler() {
    if (document.body.dataset.calendarRemoveFix === '1') return;
    document.body.dataset.calendarRemoveFix = '1';

    // Capture the click before studio-calendar.js opens its edit action.
    // Available calendar spaces can therefore be removed directly from the
    // calendar rather than forcing a trip down to the Availability table.
    document.addEventListener('click', event => {
      const eventEl = event.target.closest?.('.cal-event.available[data-available-id]');
      if (!eventEl) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      removeAvailability(eventEl.dataset.availableId);
    }, true);
  }

  function boot() {
    installPickerVisibilityFix();
    patchTimePickers();
    addCancelButtons();
    addCalendarRemoveHandler();
  }

  const observer = new MutationObserver(boot);
  observer.observe(document.body, { childList: true, subtree: true });
  boot();
})();
