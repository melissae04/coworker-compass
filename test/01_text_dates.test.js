'use strict';

const { loadApp } = require('./harness');
const app = loadApp();

describe('normalisation', () => {
  it('folds accents, case and whitespace into one key', () => {
    assert.strictEqual(app.normalizeKey_('San Sebastián'), 'san sebastian');
    assert.strictEqual(app.normalizeKey_('  LOS   ANGELES '), 'los angeles');
    assert.strictEqual(app.normalizeKey_(null), '');
  });

  it('treats the snapshot placeholders as no location', () => {
    assert.strictEqual(app.isBlankLocation_('— not public —'), true);
    assert.strictEqual(app.isBlankLocation_('—'), true);
    assert.strictEqual(app.isBlankLocation_(''), true);
    assert.strictEqual(app.isBlankLocation_('Los Angeles'), false);
  });
});

describe('name grammar (Decision #13)', () => {
  it('renders one name bare', () => {
    assert.strictEqual(app.joinNames_(['Ted Rose']), 'Ted Rose');
  });

  it('renders two names with "and" and no comma', () => {
    assert.strictEqual(app.joinNames_(['Ted Rose', 'Amy Wallace']), 'Ted Rose and Amy Wallace');
  });

  it('renders three or more with an Oxford comma', () => {
    assert.strictEqual(
      app.joinNames_(['Ted Rose', 'Amy Wallace', 'Ed Seto']),
      'Ted Rose, Amy Wallace, and Ed Seto'
    );
  });

  it('returns an empty string for an empty list', () => {
    assert.strictEqual(app.joinNames_([]), '');
  });
});

describe('date parsing', () => {
  it('reads the sheet display format', () => {
    assert.strictEqual(app.toIsoDate_('Oct 12, 2026'), '2026-10-12');
  });

  it('passes ISO strings through without a timezone shift', () => {
    assert.strictEqual(app.toIsoDate_('2026-11-03'), '2026-11-03');
    assert.strictEqual(app.toIsoDate_('2026-1-3'), '2026-01-03');
  });

  it('reads Date objects by their local components', () => {
    assert.strictEqual(app.toIsoDate_(new Date(2026, 10, 3)), '2026-11-03');
  });

  it('returns null rather than a wrong date for junk', () => {
    assert.strictEqual(app.toIsoDate_('sometime next spring'), null);
    assert.strictEqual(app.toIsoDate_(''), null);
    assert.strictEqual(app.toIsoDate_(null), null);
  });
});

describe('overlap (Decision #8)', () => {
  it('counts a shared edge day as an overlap', () => {
    assert.strictEqual(
      app.datesOverlap_('2026-11-03', '2026-11-05', '2026-11-05', '2026-11-09'), true);
    assert.strictEqual(
      app.datesOverlap_('2026-11-03', '2026-11-05', '2026-11-01', '2026-11-03'), true);
  });

  it('rejects adjacent but non-touching windows', () => {
    assert.strictEqual(
      app.datesOverlap_('2026-11-03', '2026-11-05', '2026-11-06', '2026-11-09'), false);
  });

  it('handles one window fully containing the other', () => {
    assert.strictEqual(
      app.datesOverlap_('2026-11-01', '2026-12-15', '2026-11-04', '2026-11-06'), true);
  });

  it('is false when a date is missing', () => {
    assert.strictEqual(app.datesOverlap_('2026-11-03', null, '2026-11-04', '2026-11-06'), false);
  });
});

describe('active-trip filter (Decision #10)', () => {
  it('keeps a trip ending today', () => {
    assert.strictEqual(app.isActiveTrip_('2026-09-16', '2026-09-16'), true);
  });

  it('drops a trip that ended yesterday', () => {
    assert.strictEqual(app.isActiveTrip_('2026-09-15', '2026-09-16'), false);
  });
});

describe('date range formatting', () => {
  it('omits the year within the current year', () => {
    assert.strictEqual(app.formatDateRange_('2026-11-03', '2026-11-05', '2026-09-16'),
      'Nov 3–Nov 5');
  });

  it('spans months', () => {
    assert.strictEqual(app.formatDateRange_('2026-10-30', '2026-11-02', '2026-09-16'),
      'Oct 30–Nov 2');
  });

  it('states the year when the trip is not in the current year', () => {
    assert.strictEqual(app.formatDateRange_('2027-12-30', '2028-01-02', '2026-09-16'),
      'Dec 30, 2027–Jan 2, 2028');
  });

  it('collapses a single-day trip', () => {
    assert.strictEqual(app.formatDateRange_('2026-11-03', '2026-11-03', '2026-09-16'), 'Nov 3');
  });
});
