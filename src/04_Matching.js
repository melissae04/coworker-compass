/**
 * Matching engine.
 *
 * Deliberately free of Apps Script services: every function takes plain data
 * and returns plain data, so the whole of Decisions #6, #7, #8 and #10 is
 * covered by the unit tests in test/ without a live Sheet.
 */

/**
 * Decision #7 — Metro Regions is the source of truth for clustering.
 * @param {string} city
 * @param {!Object<string, string>} metroIndex Normalised city -> cluster.
 * @return {string} '' when the city is not in the metro list.
 */
function lookupCluster_(city, metroIndex) {
  var key = normalizeKey_(city);
  if (!key) return '';
  return metroIndex[key] || '';
}

/**
 * Decision #6 — location resolution order: override, then public Directory
 * value, then unmatched.
 *
 * @param {!Object} person A Directory row.
 * @param {{bySlackId: !Object, byEmail: !Object, byName: !Object}} overrides
 * @param {!Object<string, string>} metroIndex
 * @return {{city: string, cluster: string, source: string}}
 *     source is 'override', 'directory' or 'none'.
 */
function resolveLocation_(person, overrides, metroIndex) {
  var override =
    (person.slackUserId && overrides.bySlackId[person.slackUserId]) ||
    (person.email && overrides.byEmail[person.email]) ||
    (person.name && overrides.byName[normalizeKey_(person.name)]) ||
    null;

  if (override && override.city) {
    return {
      city: override.city,
      cluster: override.cluster || lookupCluster_(override.city, metroIndex),
      source: 'override'
    };
  }

  if (person.city) {
    return {
      city: person.city,
      cluster: person.cluster || lookupCluster_(person.city, metroIndex),
      source: 'directory'
    };
  }

  return { city: '', cluster: '', source: 'none' };
}

/**
 * People whose resolved home base sits in the destination's metro cluster.
 *
 * @param {!Array<!Object>} directory
 * @param {{bySlackId: !Object, byEmail: !Object, byName: !Object}} overrides
 * @param {!Object<string, string>} metroIndex
 * @param {string} destinationCluster
 * @param {string} excludeNameKey Normalised name of the traveller.
 * @return {!Array<string>} Names, in Directory order.
 */
function findHomeBaseMatches_(directory, overrides, metroIndex, destinationCluster, excludeNameKey) {
  var target = normalizeKey_(destinationCluster);
  if (!target) return [];

  return directory
    .filter(function (person) {
      if (normalizeKey_(person.name) === excludeNameKey) return false;
      var location = resolveLocation_(person, overrides, metroIndex);
      return !!location.cluster && normalizeKey_(location.cluster) === target;
    })
    .map(function (person) { return person.name; });
}

/**
 * Other people whose logged trip overlaps this one in place and time.
 *
 * Place matching follows CONFIG.TRIP_MATCH_BY_METRO_CLUSTER: by default two
 * trips match when their metro clusters match, falling back to an exact
 * (accent- and case-insensitive) city-string comparison whenever either trip
 * has no cluster. That fallback is also what carries Decision #7's
 * unknown-city case.
 *
 * @param {!Array<!Object>} travelLog
 * @param {{city: string, cluster: string, startIso: string, endIso: string}} trip
 * @param {string} todayIsoValue
 * @param {string} excludeNameKey
 * @param {number=} excludeRowNumber Row just written for this trip, if any.
 * @param {boolean=} matchByCluster
 * @return {!Array<string>} Names, in Travel Log order.
 */
function findTripOverlapMatches_(travelLog, trip, todayIsoValue, excludeNameKey,
                                 excludeRowNumber, matchByCluster) {
  var useCluster = matchByCluster === undefined
    ? CONFIG.TRIP_MATCH_BY_METRO_CLUSTER
    : matchByCluster;
  var tripCityKey = normalizeKey_(trip.city);
  var tripClusterKey = normalizeKey_(trip.cluster);

  return travelLog
    .filter(function (other) {
      if (excludeRowNumber && other.rowNumber === excludeRowNumber) return false;
      if (normalizeKey_(other.name) === excludeNameKey) return false;
      if (!isActiveTrip_(other.endIso, todayIsoValue)) return false;
      if (!datesOverlap_(trip.startIso, trip.endIso, other.startIso, other.endIso)) return false;

      var otherClusterKey = normalizeKey_(other.cluster);
      if (useCluster && tripClusterKey && otherClusterKey) {
        return tripClusterKey === otherClusterKey;
      }
      return tripCityKey === normalizeKey_(other.city);
    })
    .map(function (other) { return other.name; });
}

/**
 * Runs both checks and merges them into the single deduplicated list the DM
 * uses (Decision #13).
 *
 * @param {{trip: !Object, travelerNameKey: string, directory: !Array<!Object>,
 *          overrides: !Object, metroIndex: !Object<string, string>,
 *          travelLog: !Array<!Object>, todayIso: string,
 *          excludeRowNumber: (number|undefined),
 *          matchByCluster: (boolean|undefined)}} input
 * @return {{names: !Array<string>, homeBaseNames: !Array<string>,
 *           tripNames: !Array<string>, clusterKnown: boolean}}
 */
function computeMatches_(input) {
  var trip = input.trip;
  var clusterKnown = !!cleanText_(trip.cluster);

  var homeBaseNames = clusterKnown
    ? findHomeBaseMatches_(input.directory, input.overrides, input.metroIndex,
        trip.cluster, input.travelerNameKey)
    : [];

  var tripNames = findTripOverlapMatches_(input.travelLog, trip, input.todayIso,
    input.travelerNameKey, input.excludeRowNumber, input.matchByCluster);

  var seen = {};
  var names = [];
  homeBaseNames.concat(tripNames).forEach(function (name) {
    var key = normalizeKey_(name);
    if (!key || seen[key]) return;
    seen[key] = true;
    names.push(name);
  });

  return {
    names: names,
    homeBaseNames: homeBaseNames,
    tripNames: tripNames,
    clusterKnown: clusterKnown
  };
}
