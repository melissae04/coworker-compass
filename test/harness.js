'use strict';

/**
 * Loads the Apps Script sources into a sandboxed context with fake Google
 * services, so the logic can be exercised with plain `node test/run.js`.
 *
 * Apps Script has no module system: every file shares one global scope and is
 * loaded in filename order. Concatenating the sources into a single VM context
 * reproduces that exactly.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_DIR = path.join(__dirname, '..', 'src');

/** A recorder that fake services write to, so tests can assert on side effects. */
function createRecorder() {
  return { slackCalls: [], errorLog: [], appendedRows: [], properties: {}, triggers: [] };
}

/**
 * Builds the fake Google/Slack service globals.
 * @param {!Object} recorder
 * @param {!Object} options
 */
function makeStubs(recorder, options) {
  const opts = options || {};

  // Build Sheet doubles from plain row arrays so callers never need the recorder.
  const sheets = {};
  Object.keys(opts.sheetData || {}).forEach((name) => {
    sheets[name] = makeFakeSheet(opts.sheetData[name], recorder, name);
  });
  recorder.sheets = sheets;
  const scriptProperties = Object.assign(
    {
      SHEET_ID: 'test-sheet',
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_VERIFICATION_TOKEN: 'verify-token',
      WEBAPP_SHARED_KEY: 'shared-key'
    },
    opts.properties || {}
  );
  recorder.properties = scriptProperties;

  return {
    console,

    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (key in scriptProperties ? scriptProperties[key] : null),
        setProperty: (key, value) => { scriptProperties[key] = value; },
        deleteProperty: (key) => { delete scriptProperties[key]; },
        getKeys: () => Object.keys(scriptProperties)
      })
    },

    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (text) => {
        const output = {
          _text: text === undefined ? '' : text,
          _mimeType: 'text/plain',
          getContent: function () { return this._text; },
          getMimeType: function () { return this._mimeType; },
          setMimeType: function (mime) { this._mimeType = mime; return this; }
        };
        return output;
      }
    },

    UrlFetchApp: {
      fetch: (url, params) => {
        recorder.slackCalls.push({ url, params });
        const method = url.split('/api/')[1].split('?')[0];
        const responder = (opts.slackResponses || {})[method];
        const body = responder
          ? (typeof responder === 'function' ? responder(params) : responder)
          : { ok: true };
        return {
          getContentText: () => JSON.stringify(body),
          getResponseCode: () => 200
        };
      }
    },

    Utilities: {
      getUuid: () => 'uuid-' + (recorder.triggers.length + Object.keys(scriptProperties).length)
    },

    ScriptApp: {
      newTrigger: (handler) => ({
        timeBased: () => ({
          after: () => ({ create: () => { recorder.triggers.push({ handler, kind: 'after' }); } }),
          everyMinutes: () => ({
            create: () => { recorder.triggers.push({ handler, kind: 'everyMinutes' }); }
          })
        })
      }),
      getProjectTriggers: () => recorder.triggers.map((trigger) => ({
        getHandlerFunction: () => trigger.handler,
        _ref: trigger
      })),
      deleteTrigger: (trigger) => {
        const index = recorder.triggers.indexOf(trigger._ref);
        if (index >= 0) recorder.triggers.splice(index, 1);
      }
    },

    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
    },

    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => sheets[name] || null,
        insertSheet: (name) => {
          sheets[name] = makeFakeSheet([], recorder, name);
          return sheets[name];
        }
      })
    }
  };
}

/**
 * A minimal Sheet double backed by a 2D array.
 * @param {!Array<!Array<*>>} values
 * @param {!Object} recorder
 * @param {string} name
 */
function makeFakeSheet(values, recorder, name) {
  const grid = values.map((row) => row.slice());
  return {
    _grid: grid,
    _name: name,
    getDataRange: () => ({ getValues: () => grid.map((row) => row.slice()) }),
    getLastRow: () => grid.length,
    appendRow: (row) => {
      grid.push(row.slice());
      recorder.appendedRows.push({ sheet: name, row: row.slice() });
    },
    insertRowAfter: (rowNumber) => {
      grid.splice(rowNumber, 0, []);
    },
    getRange: (rowNumber, columnNumber) => ({
      setValue: (value) => {
        while (grid.length < rowNumber) grid.push([]);
        const row = grid[rowNumber - 1];
        while (row.length < columnNumber) row.push('');
        row[columnNumber - 1] = value;
      },
      setValues: (rows) => {
        rows.forEach((row, offset) => {
          while (grid.length < rowNumber + offset) grid.push([]);
          grid[rowNumber - 1 + offset] = row.slice();
        });
        return { setFontWeight: () => {} };
      }
    }),
    setFrozenRows: () => {}
  };
}

/**
 * Loads every src file into one context.
 * @param {!Object=} options
 * @return {!Object} The sandbox, with a `_recorder` attached.
 */
function loadApp(options) {
  const recorder = createRecorder();
  const sandbox = makeStubs(recorder, options || {});
  vm.createContext(sandbox);

  fs.readdirSync(SRC_DIR)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .forEach((file) => {
      const code = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
      vm.runInContext(code, sandbox, { filename: file });
    });

  sandbox._recorder = recorder;
  return sandbox;
}

module.exports = { loadApp, makeFakeSheet };
