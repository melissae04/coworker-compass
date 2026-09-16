'use strict';

const { loadApp } = require('./harness');
const fixtures = require('./fixtures');

const app = loadApp();
const data = fixtures.buildData(app);
const TODAY = '2026-09-16';

/**
 * Copies an array out of the VM sandbox. Arrays created inside the sandbox have
 * that realm's Array prototype, which deepStrictEqual treats as a mismatch even
 * when the contents are identical.
 */
const arr = (value) => Array.from(value);

/** Runs a match against the real-sheet fixture. */
function matchFor(travelerName, city, startIso, endIso, overrides, options) {
  const cluster = app.lookupCluster_(city, data.metroIndex);
  return app.computeMatches_({
    trip: { city, cluster, startIso, endIso },
    travelerNameKey: app.normalizeKey_(travelerName),
    directory: data.directory,
    overrides: overrides || { bySlackId: {}, byEmail: {}, byName: {} },
    metroIndex: data.metroIndex,
    travelLog: data.travelLog,
    todayIso: TODAY,
    matchByCluster: options && options.matchByCluster
  });
}

describe('metro lookup (Decision #7)', () => {
  it('maps a listed city to its cluster', () => {
    assert.strictEqual(app.lookupCluster_('Santa Monica', data.metroIndex), 'LA Metro');
  });

  it('is accent- and case-insensitive', () => {
    assert.strictEqual(app.lookupCluster_('san sebastian', data.metroIndex),
      'San Sebastián Metro');
  });

  it('returns empty for a city not in the list', () => {
    assert.strictEqual(app.lookupCluster_('Lisbon', data.metroIndex), '');
  });
});

describe('location resolution order (Decision #6)', () => {
  const metro = data.metroIndex;

  it('prefers an override over the public Directory value', () => {
    const person = { name: 'Melissa Eisler', city: 'San Diego', cluster: 'San Diego Metro' };
    const overrides = {
      bySlackId: {}, byEmail: {},
      byName: { 'melissa eisler': { name: 'Melissa Eisler', city: 'Austin', cluster: '' } }
    };
    const resolved = app.resolveLocation_(person, overrides, metro);
    assert.strictEqual(resolved.city, 'Austin');
    assert.strictEqual(resolved.cluster, 'Austin Metro');
    assert.strictEqual(resolved.source, 'override');
  });

  it('falls back to the Directory value when no override exists', () => {
    const person = { name: 'Melissa Eisler', city: 'San Diego', cluster: 'San Diego Metro' };
    const resolved = app.resolveLocation_(person, { bySlackId: {}, byEmail: {}, byName: {} }, metro);
    assert.strictEqual(resolved.source, 'directory');
    assert.strictEqual(resolved.cluster, 'San Diego Metro');
  });

  it('reports no location when neither exists', () => {
    const person = { name: 'Dan Hunt', city: '', cluster: '' };
    const resolved = app.resolveLocation_(person, { bySlackId: {}, byEmail: {}, byName: {} }, metro);
    assert.strictEqual(resolved.source, 'none');
    assert.strictEqual(resolved.cluster, '');
  });

  it('derives a cluster from Metro Regions when the override has no cluster', () => {
    const person = { name: 'Dan Hunt', city: '', cluster: '' };
    const overrides = {
      bySlackId: {}, byEmail: {},
      byName: { 'dan hunt': { name: 'Dan Hunt', city: 'Boulder', cluster: '' } }
    };
    assert.strictEqual(app.resolveLocation_(person, overrides, metro).cluster, 'Denver Metro');
  });
});

describe('home-base matching against the real directory', () => {
  it('returns the 14 LA Metro people the prototype sheet reports', () => {
    const result = matchFor('Melissa Eisler', 'Los Angeles', '2026-11-03', '2026-11-05');
    assert.deepStrictEqual(arr(result.homeBaseNames), fixtures.LA_HOME_MATCHES);
    assert.strictEqual(result.homeBaseNames.length, 14);
  });

  it('never includes the traveller', () => {
    const result = matchFor('Roth Herrlinger', 'Santa Monica', '2026-12-01', '2026-12-03');
    assert.ok(result.names.indexOf('Roth Herrlinger') === -1);
  });

  it('matches a home base by cluster, not by city string', () => {
    // Roth lives in Santa Monica; a trip to Los Angeles is the same LA Metro.
    const result = matchFor('Melissa Eisler', 'Los Angeles', '2026-12-01', '2026-12-03');
    assert.ok(result.homeBaseNames.indexOf('Roth Herrlinger') !== -1);
  });

  it('skips the home-base check entirely for an unlisted city', () => {
    const result = matchFor('Melissa Eisler', 'Lisbon', '2026-11-03', '2026-11-05');
    assert.strictEqual(result.clusterKnown, false);
    assert.deepStrictEqual(arr(result.homeBaseNames), []);
  });

  it('brings a blank-location person into matching once they set an override', () => {
    const overrides = {
      bySlackId: {}, byEmail: {},
      byName: { 'dan hunt': { name: 'Dan Hunt', city: 'Los Angeles', cluster: 'LA Metro' } }
    };
    const result = matchFor('Melissa Eisler', 'Los Angeles', '2026-12-01', '2026-12-03', overrides);
    assert.ok(result.homeBaseNames.indexOf('Dan Hunt') !== -1);
    assert.strictEqual(result.homeBaseNames.length, 15);
  });
});

describe('trip-overlap matching', () => {
  it('finds the other traveller on overlapping LA dates', () => {
    const result = matchFor('Melissa Eisler', 'Los Angeles', '2026-11-03', '2026-11-05');
    assert.deepStrictEqual(arr(result.tripNames), ['Norian Caporale-Berkowitz']);
  });

  it('produces the 15 names the sheet shows for Melissa in LA', () => {
    const result = matchFor('Melissa Eisler', 'Los Angeles', '2026-11-03', '2026-11-05');
    assert.strictEqual(result.names.length, 15);
    assert.strictEqual(result.names[result.names.length - 1], 'Norian Caporale-Berkowitz');
  });

  it('excludes a trip that has already ended', () => {
    const result = matchFor('Ted Rose', 'Denver', '2026-10-12', '2026-10-14');
    assert.ok(result.tripNames.indexOf('Roth Herrlinger') !== -1);

    const later = app.computeMatches_({
      trip: { city: 'Denver', cluster: 'Denver Metro', startIso: '2026-10-12', endIso: '2026-10-14' },
      travelerNameKey: app.normalizeKey_('Ted Rose'),
      directory: data.directory,
      overrides: { bySlackId: {}, byEmail: {}, byName: {} },
      metroIndex: data.metroIndex,
      travelLog: data.travelLog,
      todayIso: '2026-10-15'
    });
    assert.deepStrictEqual(arr(later.tripNames), []);
  });

  it('still runs for an unlisted city (Decision #7)', () => {
    const travelLog = data.travelLog.concat([{
      rowNumber: 99, name: 'Amy Wallace', city: 'Lisbon', cluster: '',
      startIso: '2026-11-04', endIso: '2026-11-08'
    }]);
    const result = app.computeMatches_({
      trip: { city: 'Lisbon', cluster: '', startIso: '2026-11-03', endIso: '2026-11-05' },
      travelerNameKey: app.normalizeKey_('Melissa Eisler'),
      directory: data.directory,
      overrides: { bySlackId: {}, byEmail: {}, byName: {} },
      metroIndex: data.metroIndex,
      travelLog,
      todayIso: TODAY
    });
    assert.strictEqual(result.clusterKnown, false);
    assert.deepStrictEqual(arr(result.tripNames), ['Amy Wallace']);
  });

  it('matches trips across a shared metro cluster by default', () => {
    const travelLog = data.travelLog.concat([{
      rowNumber: 99, name: 'Amy Wallace', city: 'Santa Monica', cluster: 'LA Metro',
      startIso: '2026-11-04', endIso: '2026-11-08'
    }]);
    const result = app.computeMatches_({
      trip: { city: 'Los Angeles', cluster: 'LA Metro', startIso: '2026-11-03', endIso: '2026-11-05' },
      travelerNameKey: app.normalizeKey_('Melissa Eisler'),
      directory: data.directory,
      overrides: { bySlackId: {}, byEmail: {}, byName: {} },
      metroIndex: data.metroIndex,
      travelLog,
      todayIso: TODAY
    });
    assert.ok(result.tripNames.indexOf('Amy Wallace') !== -1);
  });

  it('falls back to strict city strings when cluster matching is switched off', () => {
    const travelLog = data.travelLog.concat([{
      rowNumber: 99, name: 'Amy Wallace', city: 'Santa Monica', cluster: 'LA Metro',
      startIso: '2026-11-04', endIso: '2026-11-08'
    }]);
    const result = app.computeMatches_({
      trip: { city: 'Los Angeles', cluster: 'LA Metro', startIso: '2026-11-03', endIso: '2026-11-05' },
      travelerNameKey: app.normalizeKey_('Melissa Eisler'),
      directory: data.directory,
      overrides: { bySlackId: {}, byEmail: {}, byName: {} },
      metroIndex: data.metroIndex,
      travelLog,
      todayIso: TODAY,
      matchByCluster: false
    });
    assert.strictEqual(result.tripNames.indexOf('Amy Wallace'), -1);
  });
});

describe('deduplication (Decision #13)', () => {
  it('lists someone once when they both live there and logged a trip', () => {
    const travelLog = data.travelLog.concat([{
      rowNumber: 99, name: 'Tracy Podell', city: 'Los Angeles', cluster: 'LA Metro',
      startIso: '2026-11-04', endIso: '2026-11-08'
    }]);
    const result = app.computeMatches_({
      trip: { city: 'Los Angeles', cluster: 'LA Metro', startIso: '2026-11-03', endIso: '2026-11-05' },
      travelerNameKey: app.normalizeKey_('Melissa Eisler'),
      directory: data.directory,
      overrides: { bySlackId: {}, byEmail: {}, byName: {} },
      metroIndex: data.metroIndex,
      travelLog,
      todayIso: TODAY
    });
    const occurrences = result.names.filter((name) => name === 'Tracy Podell').length;
    assert.strictEqual(occurrences, 1);
    assert.strictEqual(result.names.length, 15);
  });
});
