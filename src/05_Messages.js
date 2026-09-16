/**
 * DM copy.
 *
 * Pure string building, kept apart from delivery so the exact wording is
 * testable. Decision #13 governs the grammar; Decision #1 keeps every sentence
 * declarative — nothing here offers to make an introduction.
 */

/**
 * Builds the traveller's confirmation DM.
 *
 * @param {{city: string, startIso: string, endIso: string}} trip
 * @param {!Array<string>} names Deduplicated match list.
 * @param {boolean} clusterKnown False when the destination is missing from
 *     Metro Regions (Decision #7).
 * @param {string=} todayIsoOverride Injected by tests.
 * @return {string}
 */
function buildTripMessage_(trip, names, clusterKnown, todayIsoOverride) {
  var range = formatDateRange_(trip.startIso, trip.endIso, todayIsoOverride);
  var lines = ['🧳 You’re in ' + trip.city + ' ' + range + '.'];

  if (names && names.length) {
    // Decision #13: one merged list, names only, no cap and no ranking.
    var verb = names.length === 1 ? 'is' : 'are';
    lines.push(joinNames_(names) + ' ' + verb + ' also there.');
  } else {
    lines.push('No overlaps this time.');
  }

  if (!clusterKnown) {
    lines.push(buildUnknownCityNote_(trip.city));
  }

  return lines.join(' ');
}

/**
 * Decision #7 — verbatim copy for a destination that is not in Metro Regions.
 * @param {string} city
 * @return {string}
 */
function buildUnknownCityNote_(city) {
  return city + ' isn’t in our metro list yet — I can’t check home-base ' +
    'matches, but I’ll still catch anyone else who’s logged ' + city + ' travel. ' +
    'Ask an admin to add it to Metro Regions.';
}

/**
 * Decision #12 — confirmation for /travel-home.
 * @param {string} city
 * @param {boolean} clusterKnown
 * @return {string}
 */
function buildOverrideMessage_(city, clusterKnown) {
  var message = 'Got it — you’re now set as based in ' + city + ' for travel matching.';
  if (!clusterKnown) {
    message += ' Heads up: ' + city + ' isn’t in our metro list yet, so home-base ' +
      'matching won’t fire for you until an admin adds it to Metro Regions.';
  }
  return message;
}
