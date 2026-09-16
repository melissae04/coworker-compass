/**
 * Sheet access layer.
 *
 * Everything here reads or writes the Google Sheet and hands plain objects to
 * the rest of the app. Columns are located by header text rather than by index
 * so the sheet can be reordered or relabelled without a code change.
 */

/** @return {!Spreadsheet} */
function getSpreadsheet_() {
  return SpreadsheetApp.openById(requireProp_('SHEET_ID'));
}

/**
 * @param {string} name
 * @return {?Sheet}
 */
function getSheetOrNull_(name) {
  return getSpreadsheet_().getSheetByName(name);
}

/**
 * @param {string} name
 * @return {!Sheet}
 */
function requireSheet_(name) {
  var sheet = getSheetOrNull_(name);
  if (!sheet) {
    throw new Error('Sheet tab "' + name + '" not found. Run setupSheetTabs() once.');
  }
  return sheet;
}

/**
 * Finds the header row and maps each logical field to a zero-based column index.
 *
 * Tabs in this workbook sometimes carry title or instruction rows above the real
 * header, so the first rows are scanned and the one matching the most expected
 * headers wins.
 *
 * @param {!Array<!Array<*>>} values Full tab values.
 * @param {!Object<string, !Array<string>>} spec Field name -> accepted headers.
 * @param {number=} maxScan How many leading rows to consider.
 * @return {?{headerRowIndex: number, columns: !Object<string, number>}}
 */
function locateHeaders_(values, spec, maxScan) {
  var limit = Math.min(values.length, maxScan || 10);
  var best = null;

  for (var r = 0; r < limit; r++) {
    var row = values[r];
    var columns = {};
    var hits = 0;

    Object.keys(spec).forEach(function (field) {
      var aliases = spec[field].map(normalizeKey_);
      for (var c = 0; c < row.length; c++) {
        var cell = normalizeKey_(row[c]);
        if (cell && aliases.indexOf(cell) !== -1 && columns[field] === undefined) {
          columns[field] = c;
          hits++;
          return;
        }
      }
    });

    if (!best || hits > best.hits) {
      best = { headerRowIndex: r, columns: columns, hits: hits };
    }
  }

  if (!best || best.hits === 0) return null;
  return { headerRowIndex: best.headerRowIndex, columns: best.columns };
}

/**
 * Reads a tab into row objects.
 * @param {string} tabName
 * @param {!Object<string, !Array<string>>} spec
 * @return {{columns: !Object<string, number>, headerRowIndex: number,
 *           rows: !Array<!Object>, sheet: !Sheet}}
 */
function readTab_(tabName, spec) {
  var sheet = requireSheet_(tabName);
  var values = sheet.getDataRange().getValues();
  var located = locateHeaders_(values, spec);

  if (!located) {
    throw new Error('Could not find a header row on "' + tabName +
      '". Expected one of: ' + JSON.stringify(spec));
  }

  var rows = [];
  for (var r = located.headerRowIndex + 1; r < values.length; r++) {
    var record = { rowNumber: r + 1 };
    Object.keys(spec).forEach(function (field) {
      var col = located.columns[field];
      record[field] = col === undefined ? '' : values[r][col];
    });
    rows.push(record);
  }

  return {
    sheet: sheet,
    headerRowIndex: located.headerRowIndex,
    columns: located.columns,
    rows: rows
  };
}

/**
 * Directory people, with blank public locations preserved as blanks.
 * @return {!Array<{name: string, title: string, city: string, cluster: string,
 *                  email: string, slackUserId: string, rowNumber: number}>}
 */
function loadDirectory_() {
  var tab = readTab_(CONFIG.TABS.DIRECTORY, CONFIG.HEADERS.DIRECTORY);
  return tab.rows
    .filter(function (row) { return !!cleanText_(row.name); })
    .map(function (row) {
      return {
        rowNumber: row.rowNumber,
        name: cleanText_(row.name),
        title: cleanText_(row.title),
        city: isBlankLocation_(row.city) ? '' : cleanText_(row.city),
        cluster: isBlankLocation_(row.cluster) ? '' : cleanText_(row.cluster),
        email: cleanText_(row.email).toLowerCase(),
        slackUserId: cleanText_(row.slackUserId)
      };
    });
}

/**
 * City -> metro cluster lookup (Decision #6, hand-curated source of truth).
 * @return {!Object<string, string>} Normalised city key -> cluster label.
 */
function loadMetroIndex_() {
  var tab = readTab_(CONFIG.TABS.METRO_REGIONS, CONFIG.HEADERS.METRO_REGIONS);
  var index = {};
  tab.rows.forEach(function (row) {
    var city = cleanText_(row.city);
    var cluster = cleanText_(row.cluster);
    if (!city || !cluster || isBlankLocation_(cluster)) return;
    index[normalizeKey_(city)] = cluster;
  });
  return index;
}

/**
 * All logged trips, active and past. Filtering to active trips happens in the
 * matching layer so the caller can reason about both sets.
 * @return {!Array<{name: string, city: string, cluster: string,
 *                  startIso: ?string, endIso: ?string, rowNumber: number}>}
 */
function loadTravelLog_() {
  var tab = readTab_(CONFIG.TABS.TRAVEL_LOG, CONFIG.HEADERS.TRAVEL_LOG);
  return tab.rows
    .filter(function (row) {
      return !!cleanText_(row.name) && !!cleanText_(row.city);
    })
    .map(function (row) {
      return {
        rowNumber: row.rowNumber,
        name: cleanText_(row.name),
        city: cleanText_(row.city),
        cluster: isBlankLocation_(row.cluster) ? '' : cleanText_(row.cluster),
        startIso: toIsoDate_(row.startDate),
        endIso: toIsoDate_(row.endDate),
        notes: cleanText_(row.notes)
      };
    });
}

/**
 * Self-service location overrides (Decision #12).
 * @return {{rows: !Array<!Object>, bySlackId: !Object<string, !Object>,
 *           byEmail: !Object<string, !Object>, byName: !Object<string, !Object>}}
 */
function loadOverrides_() {
  if (!getSheetOrNull_(CONFIG.TABS.OVERRIDES)) {
    return { rows: [], bySlackId: {}, byEmail: {}, byName: {} };
  }
  var tab = readTab_(CONFIG.TABS.OVERRIDES, CONFIG.HEADERS.OVERRIDES);
  var bySlackId = {};
  var byEmail = {};
  var byName = {};
  var rows = [];

  tab.rows.forEach(function (row) {
    var record = {
      rowNumber: row.rowNumber,
      slackUserId: cleanText_(row.slackUserId),
      email: cleanText_(row.email).toLowerCase(),
      name: cleanText_(row.name),
      city: isBlankLocation_(row.city) ? '' : cleanText_(row.city),
      cluster: isBlankLocation_(row.cluster) ? '' : cleanText_(row.cluster)
    };
    if (!record.slackUserId && !record.email && !record.name) return;
    rows.push(record);
    if (record.slackUserId) bySlackId[record.slackUserId] = record;
    if (record.email) byEmail[record.email] = record;
    if (record.name) byName[normalizeKey_(record.name)] = record;
  });

  return { rows: rows, bySlackId: bySlackId, byEmail: byEmail, byName: byName };
}

/**
 * Test-user allowlist for the DM suppression flag (Decision #17).
 * @return {{slackIds: !Object<string, boolean>, emails: !Object<string, boolean>}}
 */
function loadTestUsers_() {
  var result = { slackIds: {}, emails: {} };
  if (!getSheetOrNull_(CONFIG.TABS.TEST_USERS)) return result;

  var tab = readTab_(CONFIG.TABS.TEST_USERS, CONFIG.HEADERS.TEST_USERS);
  tab.rows.forEach(function (row) {
    if (!isTruthyCell_(row.isTestUser)) return;
    var slackUserId = cleanText_(row.slackUserId);
    var email = cleanText_(row.email).toLowerCase();
    if (slackUserId) result.slackIds[slackUserId] = true;
    if (email) result.emails[email] = true;
  });
  return result;
}

/**
 * Reads a checkbox / TRUE / yes / 1 cell.
 * @param {*} value
 * @return {boolean}
 */
function isTruthyCell_(value) {
  if (value === true) return true;
  if (value === false || value === '' || value === null || value === undefined) return false;
  var key = normalizeKey_(value);
  return key === 'true' || key === 'yes' || key === 'y' || key === '1';
}

/**
 * Appends a trip to the Travel Log.
 *
 * The prototype tab keeps blank entry rows and a footer note below the data, so
 * a new row is inserted directly beneath the last real trip rather than pushed
 * to the bottom of the tab, which would land under the footer.
 *
 * @param {{name: string, city: string, cluster: string, startIso: string,
 *          endIso: string, notes: string}} trip
 * @return {number} The sheet row number written.
 */
function appendTrip_(trip) {
  var tab = readTab_(CONFIG.TABS.TRAVEL_LOG, CONFIG.HEADERS.TRAVEL_LOG);
  var sheet = tab.sheet;
  var columns = tab.columns;

  // A real trip row has both a traveller and a destination; the footer note has
  // text in the first column only, which is what distinguishes it here.
  var lastDataRow = tab.headerRowIndex + 1;
  tab.rows.forEach(function (row) {
    if (cleanText_(row.name) && cleanText_(row.city)) {
      lastDataRow = row.rowNumber;
    }
  });

  sheet.insertRowAfter(lastDataRow);
  var targetRow = lastDataRow + 1;

  writeCell_(sheet, targetRow, columns.name, trip.name);
  writeCell_(sheet, targetRow, columns.city, trip.city);
  writeCell_(sheet, targetRow, columns.cluster, trip.cluster);
  writeCell_(sheet, targetRow, columns.startDate, trip.startIso);
  writeCell_(sheet, targetRow, columns.endDate, trip.endIso);
  writeCell_(sheet, targetRow, columns.notes, trip.notes);

  return targetRow;
}

/**
 * Writes a value if the column exists. No-ops for columns the sheet lacks.
 * @param {!Sheet} sheet
 * @param {number} rowNumber 1-based.
 * @param {number|undefined} columnIndex 0-based.
 * @param {*} value
 */
function writeCell_(sheet, rowNumber, columnIndex, value) {
  if (columnIndex === undefined) return;
  sheet.getRange(rowNumber, columnIndex + 1).setValue(value === undefined ? '' : value);
}

/**
 * Inserts or updates an override row, keyed on Slack user ID (Decision #12).
 * @param {{slackUserId: string, email: string, name: string, city: string,
 *          cluster: string}} record
 * @return {{rowNumber: number, created: boolean}}
 */
function upsertOverride_(record) {
  ensureTab_(CONFIG.TABS.OVERRIDES, CONFIG.NEW_TAB_HEADERS.OVERRIDES);
  var tab = readTab_(CONFIG.TABS.OVERRIDES, CONFIG.HEADERS.OVERRIDES);
  var sheet = tab.sheet;
  var columns = tab.columns;

  var existing = null;
  tab.rows.forEach(function (row) {
    if (cleanText_(row.slackUserId) === record.slackUserId) existing = row;
  });

  var targetRow;
  var created;
  if (existing) {
    targetRow = existing.rowNumber;
    created = false;
  } else {
    targetRow = sheet.getLastRow() + 1;
    created = true;
  }

  writeCell_(sheet, targetRow, columns.slackUserId, record.slackUserId);
  writeCell_(sheet, targetRow, columns.email, record.email);
  writeCell_(sheet, targetRow, columns.name, record.name);
  writeCell_(sheet, targetRow, columns.city, record.city);
  writeCell_(sheet, targetRow, columns.cluster, record.cluster);
  writeCell_(sheet, targetRow, columns.updatedAt, new Date());

  return { rowNumber: targetRow, created: created };
}

/**
 * Creates a tab with the given header row if it does not already exist.
 * @param {string} tabName
 * @param {!Array<string>} headers
 * @return {!Sheet}
 */
function ensureTab_(tabName, headers) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(tabName);
  if (sheet) return sheet;

  sheet = spreadsheet.insertSheet(tabName);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Decision #16 — every failure lands in the Error Log tab. This function is the
 * last line of defence, so it swallows its own failures rather than throwing
 * back into a handler that is already in a catch block.
 *
 * @param {string} slackUserId
 * @param {string} command
 * @param {*} message
 */
function logError_(slackUserId, command, message) {
  var detail = message instanceof Error
    ? (message.message + (message.stack ? '\n' + message.stack : ''))
    : String(message);
  try {
    var sheet = ensureTab_(CONFIG.TABS.ERROR_LOG, CONFIG.NEW_TAB_HEADERS.ERROR_LOG);
    sheet.appendRow([new Date(), slackUserId || '', command || '', detail]);
  } catch (err) {
    console.error('Error Log write failed: ' + err + ' | original: ' + detail);
  }
}
