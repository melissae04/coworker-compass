'use strict';

const { loadApp } = require('./harness');
const fixtures = require('./fixtures');

const app = loadApp();
const TODAY = '2026-09-16';
const LA_TRIP = { city: 'Los Angeles', startIso: '2026-11-03', endIso: '2026-11-05' };

describe('trip DM copy (Decisions #1 and #13)', () => {
  it('reads as a single declarative sentence for one match', () => {
    const text = app.buildTripMessage_(
      { city: 'Denver', startIso: '2026-10-12', endIso: '2026-10-14' },
      ['Ted Rose'], true, TODAY);
    assert.strictEqual(text,
      '🧳 You’re in Denver Oct 12–Oct 14. Ted Rose is also there.');
  });

  it('uses "are" and no Oxford comma for exactly two', () => {
    const text = app.buildTripMessage_(LA_TRIP, ['Ted Rose', 'Amy Wallace'], true, TODAY);
    assert.ok(text.indexOf('Ted Rose and Amy Wallace are also there.') !== -1);
  });

  it('lists every match uncapped', () => {
    const names = fixtures.LA_HOME_MATCHES.concat(['Norian Caporale-Berkowitz']);
    const text = app.buildTripMessage_(LA_TRIP, names, true, TODAY);
    names.forEach((name) => assert.ok(text.indexOf(name) !== -1, 'missing ' + name));
    assert.ok(text.indexOf('Hyeon-Ju Rho, and Norian Caporale-Berkowitz are also there.') !== -1);
  });

  it('never offers an introduction', () => {
    const text = app.buildTripMessage_(LA_TRIP, ['Ted Rose'], true, TODAY);
    assert.strictEqual(text.toLowerCase().indexOf('intro'), -1);
  });

  it('still confirms the trip when nothing matches', () => {
    const text = app.buildTripMessage_(LA_TRIP, [], true, TODAY);
    assert.strictEqual(text,
      '🧳 You’re in Los Angeles Nov 3–Nov 5. No overlaps this time.');
  });

  it('explains an unlisted city and still promises trip matching (Decision #7)', () => {
    const text = app.buildTripMessage_(
      { city: 'Lisbon', startIso: '2026-11-03', endIso: '2026-11-05' }, [], false, TODAY);
    assert.ok(text.indexOf('Lisbon isn’t in our metro list yet') !== -1);
    assert.ok(text.indexOf('I’ll still catch anyone else who’s logged Lisbon travel') !== -1);
    assert.ok(text.indexOf('Ask an admin to add it to Metro Regions.') !== -1);
  });
});

describe('override confirmation copy (Decision #12)', () => {
  it('confirms in the agreed wording', () => {
    assert.strictEqual(app.buildOverrideMessage_('Austin', true),
      'Got it — you’re now set as based in Austin for travel matching.');
  });

  it('warns when the city is not in Metro Regions', () => {
    const text = app.buildOverrideMessage_('Lisbon', false);
    assert.ok(text.indexOf('Got it') === 0);
    assert.ok(text.indexOf('isn’t in our metro list yet') !== -1);
  });
});
