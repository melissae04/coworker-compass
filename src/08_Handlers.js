/**
 * Command handlers — the work that happens after Slack has been acknowledged.
 *
 * Everything in this file may take longer than Slack's three-second budget, so
 * nothing here runs on the request thread unless CONFIG.DEFER_PROCESSING is
 * turned off. See 09_Queue.js.
 */

/**
 * Decision #5 — resolve the submitter through their Slack email.
 *
 * Resolution order: a Slack User ID column on Directory (if one exists), then
 * email, then the Slack profile name. The name fallback exists because the
 * Directory tab is a public-site snapshot with no email column yet; see
 * docs/OPEN-ITEMS.md. Set CONFIG.ALLOW_NAME_FALLBACK_IDENTITY to false once
 * emails are in the sheet.
 *
 * @param {string} slackUserId
 * @param {!Array<!Object>} directory
 * @return {{slackUserId: string, email: string, name: string,
 *           matchedDirectory: boolean, person: ?Object}}
 */
function resolveTraveler_(slackUserId, directory) {
  var profile = slackGetUser_(slackUserId);
  var byId = null;
  var byEmail = null;
  var byName = null;

  var profileNameKeys = [
    normalizeKey_(profile.realName),
    normalizeKey_(profile.displayName)
  ].filter(function (key) { return !!key; });

  directory.forEach(function (person) {
    if (person.slackUserId && person.slackUserId === slackUserId) byId = byId || person;
    if (profile.email && person.email && person.email === profile.email) {
      byEmail = byEmail || person;
    }
    if (!byName && profileNameKeys.indexOf(normalizeKey_(person.name)) !== -1) {
      byName = person;
    }
  });

  var person = byId || byEmail || (CONFIG.ALLOW_NAME_FALLBACK_IDENTITY ? byName : null);

  return {
    slackUserId: slackUserId,
    email: profile.email,
    // Fall back to the Slack profile name so an unmatched person still gets a
    // usable Travel Log row rather than a blank one.
    name: person ? person.name : (profile.realName || profile.displayName || slackUserId),
    matchedDirectory: !!person,
    person: person
  };
}

/**
 * Processes a /travel submission end to end: write the trip, run both match
 * checks, send the DM.
 *
 * @param {{slackUserId: string, city: string, startIso: string, endIso: string,
 *          notes: string}} job
 * @return {{text: string, delivered: boolean, matchCount: number}}
 */
function processTripJob_(job) {
  var directory = loadDirectory_();
  var metroIndex = loadMetroIndex_();
  var overrides = loadOverrides_();
  // Loaded before the append so the traveller's brand-new row is not a
  // candidate for matching against itself.
  var travelLog = loadTravelLog_();

  var traveler = resolveTraveler_(job.slackUserId, directory);
  if (!traveler.matchedDirectory) {
    logError_(job.slackUserId, CONFIG.COMMANDS.TRAVEL,
      'Submitter not found in Directory; logged under Slack profile name "' +
      traveler.name + '" (email: ' + (traveler.email || 'unknown') + ').');
  }

  var cluster = lookupCluster_(job.city, metroIndex);
  var trip = {
    name: traveler.name,
    city: job.city,
    cluster: cluster,
    startIso: job.startIso,
    endIso: job.endIso,
    notes: job.notes || ''
  };

  appendTrip_(trip);

  var matches = computeMatches_({
    trip: trip,
    travelerNameKey: normalizeKey_(traveler.name),
    directory: directory,
    overrides: overrides,
    metroIndex: metroIndex,
    travelLog: travelLog,
    todayIso: todayIso_()
  });

  var text = buildTripMessage_(trip, matches.names, matches.clusterKnown);
  var delivered = deliverDm_(traveler, text, CONFIG.COMMANDS.TRAVEL);

  return { text: text, delivered: delivered, matchCount: matches.names.length };
}

/**
 * Processes a /travel-home submission (Decision #12): upsert the override row
 * keyed on Slack user ID, then confirm.
 *
 * @param {{slackUserId: string, city: string}} job
 * @return {{text: string, delivered: boolean, created: boolean}}
 */
function processHomeJob_(job) {
  var directory = loadDirectory_();
  var metroIndex = loadMetroIndex_();
  var traveler = resolveTraveler_(job.slackUserId, directory);
  var cluster = lookupCluster_(job.city, metroIndex);

  var result = upsertOverride_({
    slackUserId: traveler.slackUserId,
    email: traveler.email,
    name: traveler.name,
    city: job.city,
    cluster: cluster
  });

  var text = buildOverrideMessage_(job.city, !!cluster);
  var delivered = deliverDm_(traveler, text, CONFIG.COMMANDS.TRAVEL_HOME);

  return { text: text, delivered: delivered, created: result.created };
}

/**
 * Decision #17 — while TEST_MODE is on, matching runs against the full real
 * Directory and Travel Log but only flagged test users actually receive a DM.
 * Everyone else's message is written to the Error Log instead of sent, so the
 * output can still be checked.
 *
 * @param {{slackUserId: string, email: string, name: string}} traveler
 * @param {string} text
 * @param {string} command
 * @return {boolean} True when the DM was actually sent.
 */
function deliverDm_(traveler, text, command) {
  if (TEST_MODE && !isTestUser_(traveler)) {
    logError_(traveler.slackUserId, command + ' (suppressed by TEST_MODE)',
      'Would have sent to ' + traveler.name + ': ' + text);
    return false;
  }
  slackPostDm_(traveler.slackUserId, text);
  return true;
}

/**
 * @param {{slackUserId: string, email: string}} traveler
 * @return {boolean}
 */
function isTestUser_(traveler) {
  var testUsers = loadTestUsers_();
  if (traveler.slackUserId && testUsers.slackIds[traveler.slackUserId]) return true;
  return !!(traveler.email && testUsers.emails[traveler.email]);
}
