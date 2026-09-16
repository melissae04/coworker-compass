'use strict';

/**
 * Fixtures mirroring the real prototype sheet, so the tests assert against the
 * numbers the sheet itself reports (LA returns 14 home-base matches).
 * Source: evolution.team/team snapshot, pulled Aug 19 2026.
 */

const DIRECTORY_ROWS = [
  ['Name', 'Title', 'Home City', 'Metro Cluster'],
  ['Geoff Graber', 'Co-Founder', 'San Sebastián', 'San Sebastián Metro'],
  ['Matt Auron', 'Co-Founder', 'Los Angeles', 'LA Metro'],
  ['Dan Hunt', 'CEO', '— not public —', '—'],
  ['Becca Sweetman', 'Managing Partner', 'London', 'London Metro'],
  ['Erin Rocchio', 'Managing Partner', 'San Diego', 'San Diego Metro'],
  ['Janine Davis', 'Managing Partner', 'Los Angeles', 'LA Metro'],
  ['Lizzie Azzolino', 'Head of Talent & Growth / Partner', 'Los Angeles', 'LA Metro'],
  ['Norian Caporale-Berkowitz', 'Head of Evolutionary Contributions / Partner', 'New York City', 'NYC Metro'],
  ['Cherie Gardiner', 'Sr Partner', 'New York City', 'NYC Metro'],
  ['David Shechtman', 'Sr Partner', 'Los Angeles', 'LA Metro'],
  ['Anjani Bhargava', 'Partner Emeritus', 'Chicago', 'Chicago Metro'],
  ['Chris Alder', 'Partner Emeritus', 'Scotland', 'Scotland'],
  ['Amy Wallace', 'Partner', 'Edinburgh', 'Edinburgh Metro'],
  ['Avital Shernoff', 'Partner', 'Amsterdam', 'Amsterdam Metro'],
  ['Belma McCaffrey', 'Partner', 'Verona', 'NYC Metro'],
  ['Ed Seto', 'Partner', 'Redwood City', 'Bay Area Metro'],
  ['Erik Kellener', 'Partner', 'Los Angeles', 'LA Metro'],
  ['John Volturo', 'Partner', 'Los Angeles', 'LA Metro'],
  ['Krista Berlincourt', 'Partner', '— not public —', '—'],
  ['Lakeya Cherry', 'Partner', 'San Diego', 'San Diego Metro'],
  ['Laurence Shorter', 'Partner', 'London', 'London Metro'],
  ['Luke Entrup', 'Partner', 'Austin', 'Austin Metro'],
  ['Melissa Eisler', 'Partner', 'San Diego', 'San Diego Metro'],
  ['Nicole Sheikh', 'Partner', 'Taos', 'Taos Metro'],
  ['Olivier Hertoghe', 'Partner', 'Paris', 'Paris Metro'],
  ['Peter Gandolfo', 'Partner', 'Los Angeles', 'LA Metro'],
  ['Roth Herrlinger', 'Partner', 'Santa Monica', 'LA Metro'],
  ['Rudy Nickens', 'Partner', '— not public —', '—'],
  ['Samara Zelniker', 'Partner', 'Los Angeles', 'LA Metro'],
  ['Sandra Ortiz', 'Partner', 'Los Angeles', 'LA Metro'],
  ['Seb Agertoft', 'Partner', 'London', 'London Metro'],
  ["Simon D'Arcy", 'Partner', 'Santa Barbara', 'Santa Barbara Metro'],
  ['Ted Rose', 'Partner', 'Boulder', 'Denver Metro'],
  ['Tracy Podell', 'Partner', 'Los Angeles', 'LA Metro'],
  ['Stephanie Kissinger', 'Chief of Staff', 'Hudson Valley', 'Hudson Valley Metro'],
  ['Richie Bonilla', 'Head of Product', 'New York City', 'NYC Metro'],
  ['Cynthia Vlad', 'Head of Partner Success', 'New York City', 'NYC Metro'],
  ['Adena Philips', 'Principal', '— not public —', '—'],
  ['Courtney Orsinelli', 'Principal', 'San Diego', 'San Diego Metro'],
  ['Lauren Wood', 'Principal', '— not public —', '—'],
  ['Terry Anderson', 'Principal', '— not public —', '—'],
  ['Travis Streb', 'Principal', 'North Vancouver', 'Vancouver Metro'],
  ['Aarti Bhatnagar', 'Practitioner', 'Oakland', 'Bay Area Metro'],
  ['Abigail Jones', 'Practitioner', '— not public —', '—'],
  ['Adam Dexter', 'Practitioner', 'San Francisco', 'Bay Area Metro'],
  ['Aleah Warren-Tong', 'Practitioner', 'San Francisco Bay Area', 'Bay Area Metro'],
  ['Andrew Hapke', 'Practitioner', 'Los Angeles', 'LA Metro'],
  ['Gloria Synn', 'Practitioner', 'Los Angeles', 'LA Metro'],
  ['Hyeon-Ju Rho', 'Practitioner', 'Los Angeles', 'LA Metro'],
  ['Kathleen Ferraro', 'Practitioner', 'Connecticut', 'Connecticut'],
  ['Source: evolution.team/team, pulled Aug 19, 2026.', '', '', '']
];

const METRO_ROWS = [
  ['City', 'Metro Cluster'],
  ['San Sebastián', 'San Sebastián Metro'],
  ['Los Angeles', 'LA Metro'],
  ['Santa Monica', 'LA Metro'],
  ['San Diego', 'San Diego Metro'],
  ['London', 'London Metro'],
  ['New York City', 'NYC Metro'],
  ['Verona', 'NYC Metro'],
  ['Chicago', 'Chicago Metro'],
  ['Scotland', 'Scotland'],
  ['Edinburgh', 'Edinburgh Metro'],
  ['Amsterdam', 'Amsterdam Metro'],
  ['Redwood City', 'Bay Area Metro'],
  ['Oakland', 'Bay Area Metro'],
  ['San Francisco', 'Bay Area Metro'],
  ['San Francisco Bay Area', 'Bay Area Metro'],
  ['Austin', 'Austin Metro'],
  ['Taos', 'Taos Metro'],
  ['Paris', 'Paris Metro'],
  ['Boulder', 'Denver Metro'],
  ['Denver', 'Denver Metro'],
  ['Hudson Valley', 'Hudson Valley Metro'],
  ['North Vancouver', 'Vancouver Metro'],
  ['Santa Barbara', 'Santa Barbara Metro'],
  ['Connecticut', 'Connecticut'],
  ['Seattle', 'Seattle Metro'],
  ['Boston', 'Boston Metro'],
  ['Cambridge', 'Boston Metro']
];

const TRAVEL_LOG_ROWS = [
  ['Traveler Name', 'Destination City', 'Metro Cluster', 'Start Date', 'End Date', 'Notes'],
  ['Roth Herrlinger', 'Denver', 'Denver Metro', 'Oct 12, 2026', 'Oct 14, 2026', 'Example from the 8/7 brainstorm'],
  ['Melissa Eisler', 'Los Angeles', 'LA Metro', 'Nov 3, 2026', 'Nov 5, 2026', 'Example'],
  ['Norian Caporale-Berkowitz', 'Los Angeles', 'LA Metro', 'Nov 4, 2026', 'Nov 6, 2026', 'Example'],
  ['', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['Yellow cells are the only ones to edit.', '', '', '', '', '']
];

/** The 14 LA Metro people other than the traveller, in Directory order. */
const LA_HOME_MATCHES = [
  'Matt Auron', 'Janine Davis', 'Lizzie Azzolino', 'David Shechtman', 'Erik Kellener',
  'John Volturo', 'Peter Gandolfo', 'Roth Herrlinger', 'Samara Zelniker', 'Sandra Ortiz',
  'Tracy Podell', 'Andrew Hapke', 'Gloria Synn', 'Hyeon-Ju Rho'
];

/**
 * Converts fixture rows into the objects the matching layer consumes, mirroring
 * what loadDirectory_ / loadMetroIndex_ / loadTravelLog_ produce from the sheet.
 */
function buildData(app) {
  const directory = DIRECTORY_ROWS.slice(1)
    .filter((row) => row[0] && !String(row[0]).startsWith('Source:'))
    .map((row, index) => ({
      rowNumber: index + 2,
      name: row[0],
      title: row[1],
      city: app.isBlankLocation_(row[2]) ? '' : row[2],
      cluster: app.isBlankLocation_(row[3]) ? '' : row[3],
      email: '',
      slackUserId: ''
    }));

  const metroIndex = {};
  METRO_ROWS.slice(1).forEach((row) => {
    metroIndex[app.normalizeKey_(row[0])] = row[1];
  });

  const travelLog = TRAVEL_LOG_ROWS.slice(1)
    .filter((row) => row[0] && row[1])
    .map((row, index) => ({
      rowNumber: index + 2,
      name: row[0],
      city: row[1],
      cluster: row[2],
      startIso: app.toIsoDate_(row[3]),
      endIso: app.toIsoDate_(row[4]),
      notes: row[5]
    }));

  return { directory, metroIndex, travelLog };
}

module.exports = {
  DIRECTORY_ROWS,
  METRO_ROWS,
  TRAVEL_LOG_ROWS,
  LA_HOME_MATCHES,
  buildData
};
