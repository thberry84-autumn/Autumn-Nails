// Internal diary durations only. These are never shown to customers.
// Confirmed from Autumn Nails working times:
// - Gel Polish: 90 minutes
// - Builder Infill: 120 minutes
// - Builder Full/New Set: 150 minutes
// - Manicure: 90 minutes
// Treatments still being timed keep the existing 120-minute provisional default
// until T can give us a better real-world figure.
export const DEFAULT_DURATION_MINUTES = 120;

export const SERVICE_DURATIONS = {
  "basic-manicure": 90,
  "gel-polish": 90,
  "builder-full-set": 150,
  "builder-infill": 120,
  "builder-gel-full-set": 240,
  "builder-gel-infill": 210,
  "acrylic-full-set": 120,
  "express-gel-toes": 120
};

export function durationForService(serviceId) {
  return SERVICE_DURATIONS[serviceId] ?? DEFAULT_DURATION_MINUTES;
}

export function durationForServices(serviceIds) {
  const ids = Array.isArray(serviceIds) ? serviceIds : [];
  return ids.length ? ids.reduce((total, id) => total + durationForService(id), 0) : DEFAULT_DURATION_MINUTES;
}

export function addMinutesToTime(time, minutes) {
  const [hours, mins] = String(time).split(":").map(Number);
  const total = hours * 60 + mins + Number(minutes || 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function minutesFromMidnight(time) {
  const [hours, mins] = String(time).split(":").map(Number);
  return hours * 60 + mins;
}

export function overlaps(startA, durationA, startB, durationB) {
  const aStart = minutesFromMidnight(startA);
  const bStart = minutesFromMidnight(startB);
  return aStart < bStart + durationB && bStart < aStart + durationA;
}
