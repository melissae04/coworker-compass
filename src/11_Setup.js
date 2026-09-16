/**
 * One-time setup and manual diagnostics.
 *
 * Every function here is meant to be run by hand from the Apps Script editor.
 * Nothing in this file is on the request path.
 */

/**
 * Creates the Overrides, Error Log and Test Users tabs if they are missing.
 * Safe to run repeatedly; existing tabs are left untouched.
 */
function setupSheetTabs() {
  ensureTab_(CONFIG.TABS.OVERRIDES, CONFIG.NEW_TAB_HEADERS.OVERRIDES);
  ensureTab_(CONFIG.TABS.ERROR_LOG, CONFIG.NEW_TAB_HEADERS.ERROR_LOG);
  ensureTab_(CONFIG.TABS.TEST_USERS, CONFIG.NEW_TAB_HEADERS.TEST_USERS);
  console.log('Tabs ready: ' + [
    CONFIG.TABS.OVERRIDES, CONFIG.TABS.ERROR_LOG, CONFIG.TABS.TEST_USERS
  ].join(', '));
}

/**
 * Reads every tab and reports what was found, without writing anything.
 * Run this first after deployment — it catches a renamed tab, a missing
 * column, or an unparseable date before Slack ever hits the script.
 */
function diagnoseSheet() {
  var report = [];

  var directory = loadDirectory_();
  var withEmail = directory.filter(function (p) { return !!p.email; }).length;
  var withLocation = directory.filter(function (p) { return !!p.city; }).length;
  report.push('Directory: ' + directory.length + ' people, ' +
    withLocation + ' with a location, ' + withEmail + ' with an email.');

  if (withEmail === 0) {
    report.push('  WARNING: no Email column found on Directory. Identity matching ' +
      'will fall back to Slack profile names. See docs/OPEN-ITEMS.md.');
  }

  var metroIndex = loadMetroIndex_();
  report.push('Metro Regions: ' + Object.keys(metroIndex).length + ' cities mapped.');

  var unmapped = directory.filter(function (person) {
    return person.city && !person.cluster && !lookupCluster_(person.city, metroIndex);
  }).map(function (person) { return person.name + ' (' + person.city + ')'; });
  if (unmapped.length) {
    report.push('  Directory cities with no metro cluster: ' + unmapped.join(', '));
  }

  var travelLog = loadTravelLog_();
  var today = todayIso_();
  var active = travelLog.filter(function (trip) { return isActiveTrip_(trip.endIso, today); });
  var badDates = travelLog.filter(function (trip) { return !trip.startIso || !trip.endIso; });
  report.push('Travel Log: ' + travelLog.length + ' trips, ' + active.length +
    ' active as of ' + today + '.');
  if (badDates.length) {
    report.push('  WARNING: unreadable dates on rows ' +
      badDates.map(function (t) { return t.rowNumber; }).join(', '));
  }

  var overrides = loadOverrides_();
  report.push('Overrides: ' + overrides.rows.length + ' rows.');

  var testUsers = loadTestUsers_();
  report.push('Test Users: ' + Object.keys(testUsers.slackIds).length + ' Slack IDs, ' +
    Object.keys(testUsers.emails).length + ' emails flagged.');
  report.push('TEST_MODE is ' + (TEST_MODE ? 'ON — only flagged test users receive DMs.'
    : 'OFF — everyone receives DMs.'));

  var text = report.join('\n');
  console.log(text);
  return text;
}

/**
 * Runs the full match for a hypothetical trip and returns the DM text without
 * writing to the Travel Log or sending anything. The fastest way to sanity
 * check matching against real data.
 *
 * @param {string} travelerName Must match a Directory name.
 * @param {string} city
 * @param {string} startIso 'YYYY-MM-DD'
 * @param {string} endIso 'YYYY-MM-DD'
 * @return {string} The DM that would be sent.
 */
function previewMatch(travelerName, city, startIso, endIso) {
  var metroIndex = loadMetroIndex_();
  var trip = {
    name: travelerName,
    city: city,
    cluster: lookupCluster_(city, metroIndex),
    startIso: startIso,
    endIso: endIso
  };

  var matches = computeMatches_({
    trip: trip,
    travelerNameKey: normalizeKey_(travelerName),
    directory: loadDirectory_(),
    overrides: loadOverrides_(),
    metroIndex: metroIndex,
    travelLog: loadTravelLog_(),
    todayIso: todayIso_()
  });

  var text = buildTripMessage_(trip, matches.names, matches.clusterKnown);
  console.log(text);
  return text;
}

/**
 * Confirms the bot token works and reports which scopes Slack granted.
 * @return {string}
 */
function checkSlackAuth() {
  var body = slackGet_('auth.test', {});
  var summary = 'Connected as ' + body.user + ' in ' + body.team + ' (' + body.team_id + ').';
  console.log(summary);
  return summary;
}
