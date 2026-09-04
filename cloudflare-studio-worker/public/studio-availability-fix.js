(() => {
  const postAvailability = async () => {
    const msg = document.getElementById('slotMsg');
    const date = document.getElementById('slotDate')?.value || '';
    const startTime = document.getElementById('slotTime')?.value || '';
    const services = [...(document.getElementById('slotServices')?.selectedOptions || [])].map(o => o.value);
    if (!date || !startTime) {
      if (msg) msg.textContent = 'Please choose a date and time.';
      return;
    }
    if (msg) msg.textContent = 'Releasing…';
    try {
      const response = await fetch('/api/studio/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ date, startTime, serviceIds: services })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not release this appointment space.');
      if (msg) msg.textContent = 'Slot released.';
      if (typeof window.loadBookings === 'function') {
        try { await window.loadBookings(); } catch {}
      }
      document.dispatchEvent(new CustomEvent('studio-availability-changed'));
    } catch (error) {
      if (msg) msg.textContent = error.message || 'Could not release this appointment space.';
    }
  };
  const install = () => {
    const button = document.getElementById('addSlot');
    if (!button || button.dataset.sameOriginAvailability === '1') return;
    button.dataset.sameOriginAvailability = '1';
    button.onclick = postAvailability;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  new MutationObserver(install).observe(document.body, { childList: true, subtree: true });
})();
