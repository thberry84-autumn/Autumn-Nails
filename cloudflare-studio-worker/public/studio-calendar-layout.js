(() => {
  const moveCalendar = () => {
    const bookings = document.querySelector('#bookings');
    const calendar = document.getElementById('studioCalendar');
    if (!bookings || !calendar) return;
    const hero = bookings.querySelector('.hero');
    if (!hero) return;
    if (calendar.parentElement !== bookings || calendar.previousElementSibling !== hero) {
      hero.insertAdjacentElement('afterend', calendar);
    }
  };

  const observer = new MutationObserver(moveCalendar);
  observer.observe(document.body, { childList: true, subtree: true });
  moveCalendar();
})();
