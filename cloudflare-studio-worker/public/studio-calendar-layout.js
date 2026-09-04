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

  const installCustomerTheme = () => {
    if (document.getElementById('studio-customer-theme')) return;
    const style = document.createElement('style');
    style.id = 'studio-customer-theme';
    style.textContent = `
      :root{
        --oat:#EFE5D8;--espresso:#4B2F26;--orange:#C46A2B;--sage:#9EAE9C;--peach:#F3C7B6;--cream:#FFFDF9;--ink-soft:#70574E;--line:rgba(75,47,38,.14);--shadow:0 24px 70px rgba(75,47,38,.12);--shadow-soft:0 14px 35px rgba(75,47,38,.07);--radius-lg:34px;--radius-md:24px;
      }
      html{font-size:17px}
      body{color:var(--espresso);background:radial-gradient(circle at 12% 8%,rgba(243,199,182,.42),transparent 30%),linear-gradient(135deg,var(--oat),#faf3eb 52%,#f4e3d8);font-family:ui-rounded,"Nunito Sans","Avenir Next","Segoe UI",sans-serif;font-size:1.08rem;line-height:1.65}
      .wrap{width:min(1120px,calc(100% - 32px));padding-left:0;padding-right:0}
      .topbar{position:sticky;top:12px;background:rgba(255,253,249,.96);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.95);box-shadow:0 16px 38px rgba(75,47,38,.10);border-radius:34px;padding:12px 18px;min-height:76px}
      .brand{width:190px;flex:0 0 190px;height:64px}
      .brand img{width:185px;height:62px;object-fit:contain;object-position:left center}
      .nav{gap:3px;flex:1;flex-wrap:wrap;justify-content:flex-end}
      .nav a{padding:10px 12px;border-radius:999px;font-size:.72rem;letter-spacing:.10em;text-transform:uppercase}
      .nav a:hover,.nav a.active{background:#F3C7B6;color:var(--espresso)}
      .who{font-size:.70rem;color:#8b6c61}
      .logout{border:1px solid var(--line);background:white;color:var(--espresso);border-radius:999px;padding:11px 15px;font-size:.70rem;text-transform:uppercase;letter-spacing:.10em}
      .hero{padding:54px 0 30px}
      .kicker,.field label,.tag{color:#8d685c}
      .hero h1{font:400 clamp(3rem,6vw,5.5rem) Georgia,serif;line-height:.9;letter-spacing:-.05em;color:var(--espresso)}
      .hero h1 em{color:var(--orange)}
      .hero p,.muted,.card p{color:var(--ink-soft)}
      .panel,.card{background:rgba(255,253,249,.94);border:1px solid rgba(255,255,255,.95);box-shadow:var(--shadow);border-radius:34px}
      .panel{padding:28px}
      .card{border-radius:24px}
      .button{background:var(--espresso);color:white;border-radius:999px;padding:12px 18px;font-size:.70rem;letter-spacing:.10em}
      .button.secondary{background:rgba(255,253,249,.9);color:var(--espresso);border:1px solid var(--line)}
      .field input,.field select,.field textarea,.search{border:1px solid var(--line);border-radius:12px;background:white;color:var(--espresso)}
      .badge,.tag{background:#f3e6df;color:#80584d}
      .stats .stat{background:white;border:1px solid var(--line);border-radius:24px}
      #studioCalendar{margin:0 0 24px;background:rgba(255,253,249,.94);border:1px solid rgba(255,255,255,.95);box-shadow:var(--shadow);border-radius:34px;padding:28px}
      .studio-calendar-head h2{font:400 2rem Georgia,serif;color:var(--espresso)}
      .studio-calendar-summary>div{background:white;border:1px solid var(--line);border-radius:20px}
      .studio-calendar-wrap{border:1px solid var(--line);border-radius:20px}
      .cal-time-head,.cal-day-head,.cal-time-column{background:#fffdf9}
      .cal-day-head.today{box-shadow:inset 0 -3px 0 var(--orange)}
      .cal-event.booked{background:#f3e6df;border-color:rgba(75,47,38,.12)}
      .cal-event.available{background:#e8eee4;border-color:rgba(90,100,75,.18)}
      .studio-calendar-key{color:var(--ink-soft)}
      @media(max-width:1050px){.wrap{width:min(100% - 28px,1120px)}.nav{flex-wrap:wrap}}
      @media(max-width:760px){.topbar{align-items:flex-start;flex-wrap:wrap;border-radius:28px}.nav{order:3;flex-basis:100%;justify-content:flex-start}.who{margin-left:auto}.hero{padding-top:42px}#studioCalendar{padding:20px;border-radius:28px}}
    `;
    document.head.appendChild(style);
  };

  const observer = new MutationObserver(() => {
    installCustomerTheme();
    moveCalendar();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  installCustomerTheme();
  moveCalendar();
})();