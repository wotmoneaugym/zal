// Calendar helpers shared by the phone (PWA) and the PC. Browser-safe: no node:* imports.

/** Russian weekday names, index = Date.prototype.getUTCDay() (0 = Sunday). */
export const WEEKDAY_RU                    = Object.freeze([
  "ВОСКРЕСЕНЬЕ", "ПОНЕДЕЛЬНИК", "ВТОРНИК", "СРЕДА", "ЧЕТВЕРГ", "ПЯТНИЦА", "СУББОТА",
]);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;
const DAY_MS = 86_400_000;

function pad(value        , width        )         {
  return String(value).padStart(width, "0");
}

/** Local calendar date of `d`, like tp.date.now("YYYY-MM-DD"). Never derived from UTC (no toISOString). */
export function localDateString(d      )         {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error(`Неверная дата: ${String(d)}`);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

/** Strict YYYY-MM-DD that is a real calendar date (February 29 of a non-leap year is not). */
export function isValidDateString(s        )          {
  if (typeof s !== "string" || !DATE_SHAPE.test(s)) return false;
  const time = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === s;
}

function utcMidnight(date        )       {
  if (!isValidDateString(date)) throw new Error(`Неверная дата: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

/** ISO weekday of a date string: 1 = Monday … 7 = Sunday, like moment's isoWeekday(). */
export function isoWeekdayOf(date        )         {
  const day = utcMidnight(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Russian weekday name of a date string, the same for every time zone. */
export function weekdayNameOf(date        )         {
  return WEEKDAY_RU[utcMidnight(date).getUTCDay()];
}

/** Calendar arithmetic in UTC (no DST there), so a day is always 24 h. */
export function addDays(date        , days        )         {
  if (!Number.isInteger(days)) throw new Error(`Неверное число дней: ${days}`);
  return new Date(utcMidnight(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}
