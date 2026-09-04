(() => {
  const API = 'https://studio-booking-api.autumnnails.com';
  const MIN_TIME = '06:00';
  const MAX_TIME = '22:00';

  function installPickerFixes() {
    if (document.getElementById('studio-time-picker-fix')) return;
    const style = document.createElement('style');
    style.id = 'studio-time-picker-fix';
    style.textContent = `
      .time-picker-popover[hidden]{display:none!important;}
      .cal-event.booked.cancelled{display:none!important;}
      .cal-event .cal-action{display:inline-flex;align-items:center;justify-content:center;margin-top:5px;margin-right:4px;padding:3px 7px;border-radius:999px;border:1px solid rgba(100,52,45,.16);background:rgba(255,255,255,.82);font-size:.56rem;line-height:1.2;font-weight:700;cursor:pointer;text-decoration:none!important;white-space:nowrap;}
      .cal-event .cal-action:hover{background:white;}
      .cal-event.available .cal-action.remove{color:#8a4036;}
      .cal-event.booked .cal-action.cancel{color:#8a4036;}
    `;
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
      if (wrap.dataset.studioTimeRangeFixed === '1') return;
      const picker = wrap.querySelector('.time-picker-popover');
      if (!picker) return;

      const values = [];
      for (let mins = 6 * 60; mins <= 22 * 60; mins += 15) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        values.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
      const current = input.value || MIN_TIME;
      picker.innerHTML = values.map(value =>
        `<button type="button" class="time-choice ${value === current ? 'selected' : ''}" data-time="${value}">${value}</button>`
      ).join('');
      picker.style.maxHeight = 'none';
      picker.style.overflow = 'visible';

      const button = wrap.querySelector('.time-picker-button');
      if (button && (!button.textContent || button.textContent === 'Choose time')) button.textContent = current;
      wrap.dataset.studioTimeRangeFixed = '1';
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
      const response = await fetch(`${API}/api/bookings/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store'
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
      const response = await fetch(`${API}/api/availability/${encodeURIComponent(id)}/remove`, {
        method: 'POST',
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

  // Replace the old table action as well, so the Availability table uses the
  // same preflight-free mutation path as the calendar.
  window.removeSlot = removeAvailability;

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

  function addCalendarActions() {
    document.querySelectorAll('.cal-event.available[data-available-id]').forEach(eventEl => {
      if (eventEl.querySelector('.cal-action.remove')) return;
      const action = document.createElement('span');
      action.className = 'cal-action remove';
      action.setAttribute('role', 'button');
      action.setAttribute('tabindex', '0');
      action.textContent = 'Remove';
      const run = event => {
        event.preventDefault();
        event.stopPropagation();
        removeAvailability(eventEl.dataset.availableId);
      };
      action.addEventListener('click', run);
      action.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') run(event);
      });
      eventEl.appendChild(action);
    });

    document.querySelectorAll('.cal-event.booked[data-booking-id]:not(.cancelled)').forEach(eventEl => {
      if (eventEl.querySelector('.cal-action.cancel')) return;
      const action = document.createElement('span');
      action.className = 'cal-action cancel';
      action.setAttribute('role', 'button');
      action.setAttribute('tabindex', '0');
      action.textContent = 'Cancel';
      const run = event => {
        event.preventDefault();
        event.stopPropagation();
        cancelBooking(eventEl.dataset.bookingId);
      };
      action.addEventListener('click', run);
      action.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') run(event);
      });
      eventEl.appendChild(action);
    });
  }

  function boot() {
    installPickerFixes();
    patchTimePickers();
    addCancelButtons();
    addCalendarActions();
  }

  const observer = new MutationObserver(boot);
  observer.observe(document.body, { childList: true, subtree: true });
  boot();
})();
