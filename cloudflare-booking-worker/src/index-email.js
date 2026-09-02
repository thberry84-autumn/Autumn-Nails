import bookingWorker from "./index-v2.js";

const BUSINESS_EMAIL = "autumnnails.uk@gmail.com";
const EMAIL_FROM = "bookings@autumnnails.com";
const APPOINTMENT_DURATION_MINUTES = 120;
const ADDONS = {
  "nail-art": { name: "Nail Art (per nail)", price: 100 },
  "nail-stamping": { name: "Nail Stamping (per nail)", price: 100 },
  "nail-stamping-full-set": { name: "Nail Stamping (full set, per colour)", price: 600 }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/calendar/event/") && request.method === "GET") {
      return await bookingCalendarEvent(url.pathname.slice("/calendar/event/".length), env);
    }

    const bookingRequest = request.method === "POST" && url.pathname === "/api/book";
    const requestCopy = bookingRequest ? request.clone() : null;
    const response = await bookingWorker.fetch(request, env, ctx);

    if (bookingRequest && response.status === 201 && env.EMAIL) {
      try {
        const body = await requestCopy.json();
        const payload = await response.clone().json();
        const booking = payload?.booking;
        if (booking?.id && body?.email) {
          const calendarUrl = bookingCalendarUrl(booking.id, env);
          const emailData = buildEmailData(body, booking, calendarUrl);
          ctx?.waitUntil(sendBookingEmails(env, emailData));
        }
      } catch (error) {
        console.error("Unable to prepare booking notification emails:", error);
      }
    }

    if (bookingRequest && response.status === 201) {
      try {
        const data = await response.clone().json();
        if (data?.booking) {
          data.booking.calendarUrl = bookingCalendarUrl(data.booking.id, env);
          const headers = new Headers(response.headers);
          // We replace the body, so do not carry through transport headers that
          // could describe the original body and make browsers reject the JSON.
          headers.delete("Content-Encoding");
          headers.delete("Content-Length");
          headers.set("Content-Type", "application/json; charset=utf-8");
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        }
      } catch (error) {
        console.error("Unable to add calendar URL to booking response:", error);
      }
    }

    return response;
  }
};

function buildEmailData(body, booking, calendarUrl) {
  const firstName = cleanText(body.firstName, 80);
  const surname = cleanText(body.surname, 80);
  const email = normaliseEmail(body.email);
  const phone = cleanText(body.phone, 40);
  const addonLines = formatAddons(body.addons);
  const date = formatDate(booking.date);
  const time = `${formatTime(booking.startTime)} – ${formatTime(booking.endTime)}`;
  const price = formatMoney(booking.price);
  const customerName = `${firstName} ${surname}`.trim();
  const infillNote = booking.infillChanged ? "The requested infill was outside the 21-day window, so the booking was changed to the applicable full-set service." : "";

  return { customerName, email, phone, date, time, service: booking.service, requestedService: booking.requestedService, price, addonLines, infillNote, calendarUrl };
}

async function sendBookingEmails(env, data) {
  const base = {
    from: { email: EMAIL_FROM, name: "Autumn Nails" },
    replyTo: EMAIL_FROM
  };

  const businessText = [
    "A new Autumn Nails appointment has been booked.",
    "",
    `Client: ${data.customerName}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone}`,
    `Date: ${data.date}`,
    `Time: ${data.time}`,
    `Treatment: ${data.service}`,
    data.requestedService !== data.service ? `Requested: ${data.requestedService}` : "",
    `Price: ${data.price}`,
    data.addonLines.length ? `Add-ons: ${data.addonLines.join(", ")}` : "Add-ons: None",
    data.infillNote,
    "",
    `Add this appointment to your calendar: ${data.calendarUrl}`
  ].filter(Boolean).join("\n");

  const businessHtml = emailShell(
    "New booking",
    `<p>A new Autumn Nails appointment has been booked.</p>
     ${detailTable([
       ["Client", escapeHtml(data.customerName)],
       ["Email", escapeHtml(data.email)],
       ["Phone", escapeHtml(data.phone)],
       ["Date", escapeHtml(data.date)],
       ["Time", escapeHtml(data.time)],
       ["Treatment", escapeHtml(data.service)],
       ...(data.requestedService !== data.service ? [["Requested", escapeHtml(data.requestedService)]] : []),
       ["Price", escapeHtml(data.price)],
       ["Add-ons", escapeHtml(data.addonLines.length ? data.addonLines.join(", ") : "None")]
     ])}
     ${data.infillNote ? `<p><strong>Infill note:</strong> ${escapeHtml(data.infillNote)}</p>` : ""}
     <p><a class="button" href="${escapeAttribute(data.calendarUrl)}">Add to calendar</a></p>`
  );

  const clientText = [
    `Hi ${data.customerName.split(" ")[0] || "there"},`,
    "",
    "Thank you for booking with Autumn Nails. Your appointment is confirmed.",
    "",
    `${data.date}`,
    `${data.time}`,
    `${data.service}`,
    `${data.price}`,
    data.addonLines.length ? `Add-ons: ${data.addonLines.join(", ")}` : "",
    data.infillNote,
    "",
    `Add this appointment to your calendar: ${data.calendarUrl}`,
    "",
    "We look forward to seeing you!",
    "",
    "Autumn Nails"
  ].filter(Boolean).join("\n");

  const clientHtml = emailShell(
    "Your appointment is confirmed",
    `<p>Hi ${escapeHtml(data.customerName.split(" ")[0] || "there")},</p>
     <p>Thank you for booking with Autumn Nails. Your appointment is confirmed.</p>
     ${detailTable([
       ["Date", escapeHtml(data.date)],
       ["Time", escapeHtml(data.time)],
       ["Treatment", escapeHtml(data.service)],
       ["Price", escapeHtml(data.price)],
       ["Add-ons", escapeHtml(data.addonLines.length ? data.addonLines.join(", ") : "None")]
     ])}
     ${data.infillNote ? `<p>${escapeHtml(data.infillNote)}</p>` : ""}
     <p><a class="button" href="${escapeAttribute(data.calendarUrl)}">Add to calendar</a></p>
     <p>We look forward to seeing you!</p>
     <p>Autumn Nails</p>`
  );

  const sends = [
    env.EMAIL.send({ ...base, to: BUSINESS_EMAIL, subject: `New booking – ${data.customerName} – ${data.date}`, text: businessText, html: businessHtml }),
    env.EMAIL.send({ ...base, to: data.email, subject: "Your Autumn Nails appointment is confirmed", text: clientText, html: clientHtml })
  ];

  const results = await Promise.allSettled(sends);
  results.forEach((result, index) => {
    if (result.status === "rejected") console.error(index === 0 ? "Business booking email failed:" : "Client booking email failed:", result.reason);
  });
}

async function bookingCalendarEvent(bookingId, env) {
  const id = decodeURIComponent(String(bookingId || "")).trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT b.id,b.date,b.start_time,b.status,b.booked_service_id,c.first_name,c.surname FROM bookings b JOIN clients c ON c.id=b.client_id WHERE b.id=? LIMIT 1").bind(id).first();
  if (!row || row.status === "cancelled") return new Response("Not found", { status: 404 });
  const stamp = toIcsDateTime(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(11, 16));
  const summary = `Autumn Nails – ${serviceName(row.booked_service_id)}`;
  const description = `${serviceName(row.booked_service_id)} appointment at Autumn Nails.`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Autumn Nails//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:booking-${row.id}@autumnnails.com`,
    `DTSTAMP:${stamp}Z`,
    `DTSTART;TZID=Europe/London:${toIcsDateTime(row.date, row.start_time)}`,
    `DTEND;TZID=Europe/London:${toIcsDateTime(row.date, addMinutesToTime(row.start_time, APPOINTMENT_DURATION_MINUTES))}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].join("\r\n");
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=autumn-nails-appointment.ics",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    }
  });
}

function bookingCalendarUrl(bookingId, env) {
  const base = (env.BOOKING_PUBLIC_URL || "https://autumn-nails-booking.workers.dev").replace(/\/$/, "");
  return `${base}/calendar/event/${encodeURIComponent(bookingId)}.ics`;
}

function emailShell(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f7f0eb;font-family:Arial,sans-serif;color:#63352d"><div style="max-width:620px;margin:24px auto;background:#fffaf7;border:1px solid #eadbd3;border-radius:18px;padding:32px"><div style="font-family:Georgia,serif;font-size:30px;margin-bottom:22px">Autumn <span style="font-family:Arial,sans-serif;font-size:14px;letter-spacing:4px">NAILS</span></div><h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal">${escapeHtml(title)}</h1>${body}<p style="margin-top:28px;font-size:13px;color:#8b6a61">Autumn Nails · Portsmouth</p></div></body></html>`;
}
function detailTable(rows) { return `<table style="width:100%;border-collapse:collapse;margin:18px 0">${rows.map(([label,value]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #eadbd3;font-weight:bold;width:34%">${label}</td><td style="padding:9px 0;border-bottom:1px solid #eadbd3">${value}</td></tr>`).join("")}</table>`; }
function formatAddons(value) { if (!value || typeof value !== "object") return []; return Object.entries(ADDONS).flatMap(([id, meta]) => { const quantity = Math.floor(Math.max(0, Number(value[id] || 0))); return Number.isFinite(quantity) && quantity > 0 ? [`${meta.name} × ${quantity}`] : []; }); }
function serviceName(id) { const names = { "basic-manicure": "Basic Manicure", "gel-polish": "Gel Polish", "builder-full-set": "Builder Full Set", "builder-infill": "Builder Infill", "builder-gel-full-set": "Builder & Gel Polish Full Set", "builder-gel-infill": "Builder & Gel Polish Infill", "acrylic-full-set": "Acrylic – Full Set", "express-gel-toes": "Express Gel Toes" }; return names[id] || id; }
function formatMoney(pence) { return `£${(Number(pence || 0) / 100).toFixed(2)}`; }
function formatDate(value) { const date = new Date(`${value}T12:00:00`); return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(date); }
function formatTime(value) { const [hour, minute] = String(value).split(":").map(Number); return `${String(hour % 12 || 12)}:${String(minute).padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`; }
function cleanText(value, max) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, max); }
function normaliseEmail(value) { return String(value || "").trim().toLowerCase().slice(0, 254); }
function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function escapeAttribute(value) { return escapeHtml(value); }
function minutesFromMidnight(time) { const [h, m] = time.split(":").map(Number); return h * 60 + m; }
function addMinutesToTime(time, minutes) { const total = minutesFromMidnight(time) + minutes; return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function toIcsDateTime(date, time) { return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`; }
function escapeIcs(value) { return String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1"); }
