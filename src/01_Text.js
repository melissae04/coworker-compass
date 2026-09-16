/**
 * String normalisation shared by every lookup in the app.
 *
 * Every comparison of a person's name, a city or a metro cluster goes through
 * here so that "San Sebastián", "san sebastian" and " San  Sebastian " are one
 * key. Nothing in this file touches Apps Script services, which keeps it
 * directly unit-testable.
 */

/**
 * Lowercases, strips diacritics, and collapses whitespace.
 * @param {*} value
 * @return {string} '' when the value is empty or not string-like.
 */
function normalizeKey_(value) {
  if (value === null || value === undefined) return '';
  var text = String(value);
  if (typeof text.normalize === 'function') {
    text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Trims a cell value to a display string.
 * @param {*} value
 * @return {string}
 */
function cleanText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * True when a Directory/Overrides location cell carries no usable location.
 * The public-site snapshot records unknown locations as "— not public —" and
 * the metro cluster as a bare em dash, so those are treated as blank.
 * @param {*} value
 * @return {boolean}
 */
function isBlankLocation_(value) {
  var text = cleanText_(value);
  if (!text) return true;
  var key = normalizeKey_(text);
  if (/^[—–\-\s]*$/.test(text)) return true;
  for (var i = 0; i < CONFIG.BLANK_LOCATION_MARKERS.length; i++) {
    if (normalizeKey_(CONFIG.BLANK_LOCATION_MARKERS[i]) === key) return true;
  }
  return key.indexOf('not public') !== -1;
}

/**
 * Renders a list of names using the grammar in Decision #13.
 *   1  -> "Ada"
 *   2  -> "Ada and Grace"
 *   3+ -> "Ada, Grace, and Alan"  (Oxford comma)
 * @param {!Array<string>} names
 * @return {string}
 */
function joinNames_(names) {
  var list = (names || []).filter(function (n) { return !!cleanText_(n); });
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return list[0] + ' and ' + list[1];
  return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
}
