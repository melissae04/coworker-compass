/**
 * Date handling.
 *
 * Every date in this system is carried as a 'YYYY-MM-DD' string. Slack's date
 * picker already speaks that format, ISO strings sort lexicographically, and
 * string comparison sidesteps the timezone drift that bites date arithmetic in
 * Apps Script. Dates read back from the Sheet arrive as JS Date objects and are
 * converted once, on the way in.
 *
 * Apps Script evaluates Date methods in the project timezone (set in
 * appsscript.json). Keep that timezone equal to the Sheet's timezone or the
 * conversion below can land a day off.
 */

var MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * @param {number} n
 * @return {string} Zero-padded to two digits.
 */
function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * Converts a Date object to 'YYYY-MM-DD' using its local components.
 * @param {!Date} date
 * @return {?string}
 */
function dateToIso_(date) {
  if (!date || isNaN(date.getTime())) return null;
  return date.getFullYear() + '-' + pad2_(date.getMonth() + 1) + '-' + pad2_(date.getDate());
}

/**
 * Normalises anything a cell or a Slack payload can hold into 'YYYY-MM-DD'.
 * @param {*} value A Date, an ISO string, or a display string like "Oct 12, 2026".
 * @return {?string} null when the value cannot be read as a date.
 */
function toIsoDate_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return dateToIso_(value);
  }
  var text = String(value).trim();
  if (!text) return null;

  var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return iso[1] + '-' + pad2_(Number(iso[2])) + '-' + pad2_(Number(iso[3]));
  }

  // "Oct 12, 2026", "10/12/2026" and similar parse to local midnight, so the
  // local components are the intended calendar date.
  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  return dateToIso_(parsed);
}

/**
 * @return {string} Today in the script timezone, as 'YYYY-MM-DD'.
 */
function todayIso_() {
  return dateToIso_(new Date());
}

/**
 * Decision #8 — overlap is inclusive of shared edge days.
 * @param {string} startA
 * @param {string} endA
 * @param {string} startB
 * @param {string} endB
 * @return {boolean}
 */
function datesOverlap_(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}

/**
 * Decision #10 — a trip stays in the log but drops out of matching once it ends.
 * @param {string} endIso
 * @param {string} todayIso
 * @return {boolean}
 */
function isActiveTrip_(endIso, todayIso) {
  return !!endIso && endIso >= todayIso;
}

/**
 * Formats a trip window the way the digest reads it: "Nov 3–Nov 5",
 * "Oct 30–Nov 2", or "Dec 30, 2027–Jan 2, 2028" when a year needs stating.
 * @param {string} startIso
 * @param {string} endIso
 * @param {string=} todayIsoOverride Injected by tests.
 * @return {string}
 */
function formatDateRange_(startIso, endIso, todayIsoOverride) {
  if (!startIso || !endIso) return '';
  var today = todayIsoOverride || todayIso_();
  var currentYear = today.slice(0, 4);

  var start = splitIso_(startIso);
  var end = splitIso_(endIso);
  var showStartYear = start.year !== currentYear;
  var showEndYear = end.year !== currentYear || end.year !== start.year;

  if (startIso === endIso) {
    return formatDay_(start, showStartYear);
  }
  return formatDay_(start, showStartYear || start.year !== end.year) +
    '–' + formatDay_(end, showEndYear);
}

/**
 * @param {string} iso
 * @return {{year: string, monthIndex: number, day: number}}
 */
function splitIso_(iso) {
  var parts = String(iso).split('-');
  return {
    year: parts[0],
    monthIndex: Number(parts[1]) - 1,
    day: Number(parts[2])
  };
}

/**
 * @param {{year: string, monthIndex: number, day: number}} parts
 * @param {boolean} withYear
 * @return {string}
 */
function formatDay_(parts, withYear) {
  var label = MONTH_ABBREVIATIONS[parts.monthIndex] + ' ' + parts.day;
  return withYear ? label + ', ' + parts.year : label;
}
