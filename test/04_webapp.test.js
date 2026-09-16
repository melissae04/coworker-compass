'use strict';

const { loadApp } = require('./harness');
const fixtures = require('./fixtures');

const MELISSA = {
  ok: true,
  user: {
    id: 'U_MEL',
    profile: { email: 'melissa@evolution.team', real_name: 'Melissa Eisler', display_name: 'melissa' }
  }
};

/**
 * Builds a fully stubbed app: real fixture data in the sheets, Slack answering
 * as Melissa.
 */
function bootstrap(extra) {
  const options = Object.assign({
    sheetData: {
      Directory: fixtures.DIRECTORY_ROWS.map((row) => row.slice()),
      'Metro Regions': fixtures.METRO_ROWS.map((row) => row.slice()),
      'Travel Log': fixtures.TRAVEL_LOG_ROWS.map((row) => row.slice())
    },
    slackResponses: {
      'users.info': MELISSA,
      'views.open': { ok: true },
      'chat.postMessage': { ok: true }
    }
  }, extra || {});

  if (extra && extra.sheetData) {
    options.sheetData = Object.assign({
      Directory: fixtures.DIRECTORY_ROWS.map((row) => row.slice()),
      'Metro Regions': fixtures.METRO_ROWS.map((row) => row.slice()),
      'Travel Log': fixtures.TRAVEL_LOG_ROWS.map((row) => row.slice())
    }, extra.sheetData);
  }

  return loadApp(options);
}

/** Encodes a form body the way Slack posts one. */
function formBody(fields) {
  return Object.keys(fields)
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(fields[key]))
    .join('&');
}

/** Builds the doPost event object for a Slack request. */
function slackRequest(fields, queryKey) {
  return {
    parameter: Object.assign({ k: queryKey === undefined ? 'shared-key' : queryKey }, fields),
    postData: { contents: formBody(fields), type: 'application/x-www-form-urlencoded' }
  };
}

/** Builds a view_submission payload. */
function tripSubmission(values) {
  return {
    type: 'view_submission',
    token: 'verify-token',
    user: { id: 'U_MEL' },
    view: {
      callback_id: 'cowork_compass_trip',
      state: {
        values: {
          block_city: { action_city: { value: values.city } },
          block_start: { action_start: { selected_date: values.start } },
          block_end: { action_end: { selected_date: values.end } },
          block_notes: { action_notes: { value: values.notes || '' } }
        }
      }
    }
  };
}

function slackMethods(app) {
  return app._recorder.slackCalls.map((call) => call.url.split('/api/')[1].split('?')[0]);
}

describe('request authentication', () => {
  it('rejects a request with the wrong shared key', () => {
    const app = bootstrap();
    app.doPost(slackRequest({ command: '/travel', trigger_id: 'T1', token: 'verify-token' }, 'wrong'));
    assert.deepStrictEqual(slackMethods(app), []);
  });

  it('rejects a request with the wrong verification token', () => {
    const app = bootstrap();
    app.doPost(slackRequest({ command: '/travel', trigger_id: 'T1', token: 'nope' }));
    assert.deepStrictEqual(slackMethods(app), []);
  });

  it('fails closed when neither check is configured', () => {
    const app = bootstrap({ properties: { WEBAPP_SHARED_KEY: '', SLACK_VERIFICATION_TOKEN: '' } });
    app.doPost(slackRequest({ command: '/travel', trigger_id: 'T1', token: 'anything' }, ''));
    assert.deepStrictEqual(slackMethods(app), []);
  });

  it('accepts a correctly signed request', () => {
    const app = bootstrap();
    app.doPost(slackRequest({ command: '/travel', trigger_id: 'T1', token: 'verify-token' }));
    assert.deepStrictEqual(slackMethods(app), ['views.open']);
  });

  it('reads the token out of an interactivity payload', () => {
    const app = bootstrap();
    assert.strictEqual(app.readPayloadToken_(JSON.stringify({ token: 'verify-token' })),
      'verify-token');
    assert.strictEqual(app.readPayloadToken_('not json'), '');
  });

  it('compares keys without leaking length through timing', () => {
    const app = bootstrap();
    assert.strictEqual(app.constantTimeEquals_('abc', 'abc'), true);
    assert.strictEqual(app.constantTimeEquals_('abc', 'abcd'), false);
    assert.strictEqual(app.constantTimeEquals_('', ''), true);
  });
});

describe('body parsing', () => {
  it('parses a urlencoded body when Apps Script does not', () => {
    const app = bootstrap();
    const params = app.parseRequestParams_({
      parameter: { k: 'shared-key' },
      postData: { contents: 'command=%2Ftravel&text=hello+world&token=verify-token' }
    });
    assert.strictEqual(params.command, '/travel');
    assert.strictEqual(params.text, 'hello world');
  });
});

describe('slash command routing', () => {
  it('opens the trip modal for /travel', () => {
    const app = bootstrap();
    app.doPost(slackRequest({ command: '/travel', trigger_id: 'T1', token: 'verify-token' }));
    const view = JSON.parse(app._recorder.slackCalls[0].params.payload).view;
    assert.strictEqual(view.callback_id, 'cowork_compass_trip');
    const blockIds = view.blocks.map((block) => block.block_id).filter(Boolean);
    assert.deepStrictEqual(Array.from(blockIds),
      ['block_city', 'block_start', 'block_end', 'block_notes']);
  });

  it('uses native date pickers, not text inputs (Decision #16)', () => {
    const app = bootstrap();
    app.doPost(slackRequest({ command: '/travel', trigger_id: 'T1', token: 'verify-token' }));
    const view = JSON.parse(app._recorder.slackCalls[0].params.payload).view;
    const types = {};
    view.blocks.forEach((block) => {
      if (block.block_id) types[block.block_id] = block.element.type;
    });
    assert.strictEqual(types.block_start, 'datepicker');
    assert.strictEqual(types.block_end, 'datepicker');
  });

  it('opens the single-field modal for /travel-home', () => {
    const app = bootstrap();
    app.doPost(slackRequest({ command: '/travel-home', trigger_id: 'T1', token: 'verify-token' }));
    const view = JSON.parse(app._recorder.slackCalls[0].params.payload).view;
    assert.strictEqual(view.callback_id, 'cowork_compass_home');
    const inputs = view.blocks.filter((block) => block.type === 'input');
    assert.strictEqual(inputs.length, 1);
  });
});

describe('trip submission validation', () => {
  it('rejects an end date before the start date and keeps the modal open', () => {
    const app = bootstrap();
    const response = app.doPost(slackRequest({
      payload: JSON.stringify(tripSubmission({ city: 'Denver', start: '2026-11-05', end: '2026-11-03' })),
      token: 'verify-token'
    }));
    const body = JSON.parse(response.getContent());
    assert.strictEqual(body.response_action, 'errors');
    assert.ok(body.errors.block_end.indexOf('before the start date') !== -1);
    assert.strictEqual(app._recorder.triggers.length, 0);
  });

  it('rejects an empty city', () => {
    const app = bootstrap();
    const response = app.doPost(slackRequest({
      payload: JSON.stringify(tripSubmission({ city: '   ', start: '2026-11-03', end: '2026-11-05' })),
      token: 'verify-token'
    }));
    assert.strictEqual(JSON.parse(response.getContent()).errors.block_city, 'Enter a destination city.');
  });

  it('acknowledges a valid submission instantly and queues the work (Decision #3)', () => {
    const app = bootstrap();
    const response = app.doPost(slackRequest({
      payload: JSON.stringify(tripSubmission({ city: 'Los Angeles', start: '2026-11-03', end: '2026-11-05' })),
      token: 'verify-token'
    }));
    assert.strictEqual(response.getContent(), '');
    // No sheet or Slack work happened on the request thread.
    assert.deepStrictEqual(slackMethods(app), []);
    const jobKeys = Object.keys(app._recorder.properties).filter((key) => key.indexOf('job:') === 0);
    assert.strictEqual(jobKeys.length, 1);
    assert.strictEqual(app._recorder.triggers.length, 1);
    assert.strictEqual(app._recorder.triggers[0].handler, 'processJobQueue');
  });
});

describe('queued trip processing', () => {
  function submitAndDrain(app, values) {
    app.doPost(slackRequest({
      payload: JSON.stringify(tripSubmission(values)),
      token: 'verify-token'
    }));
    app.processJobQueue();
  }

  it('writes the trip to the Travel Log above the footer note', () => {
    const app = bootstrap();
    submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });

    const grid = app._recorder.sheets['Travel Log']._grid;
    const newRow = grid[4];
    assert.strictEqual(newRow[0], 'Melissa Eisler');
    assert.strictEqual(newRow[1], 'Los Angeles');
    assert.strictEqual(newRow[2], 'LA Metro');
    assert.strictEqual(newRow[3], '2026-12-01');
    assert.strictEqual(newRow[4], '2026-12-03');
    // The footer note is still the last row, not overwritten.
    assert.strictEqual(grid[grid.length - 1][0], 'Yellow cells are the only ones to edit.');
  });

  it('suppresses the DM for an unflagged user while TEST_MODE is on (Decision #17)', () => {
    const app = bootstrap();
    submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });

    assert.strictEqual(slackMethods(app).indexOf('chat.postMessage'), -1);
    const suppressed = app._recorder.appendedRows.filter(
      (entry) => entry.sheet === 'Error Log' && /suppressed by TEST_MODE/.test(entry.row[2]));
    assert.strictEqual(suppressed.length, 1);
    assert.ok(/are also there/.test(suppressed[0].row[3]));
  });

  it('sends the DM to a flagged test user', () => {
    const app = bootstrap({
      sheetData: {
        'Test Users': [
          ['Slack User ID', 'Email', 'is_test_user', 'Note'],
          ['U_MEL', 'melissa@evolution.team', true, 'dev']
        ]
      }
    });
    submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });

    const dm = app._recorder.slackCalls.find((call) => call.url.indexOf('chat.postMessage') !== -1);
    assert.ok(dm, 'expected a DM');
    const body = JSON.parse(dm.params.payload);
    assert.strictEqual(body.channel, 'U_MEL');
    assert.ok(body.text.indexOf('You’re in Los Angeles') !== -1);
    assert.ok(body.text.indexOf('Roth Herrlinger') !== -1);
  });

  it('sends the DM to everyone once TEST_MODE is off', () => {
    const app = bootstrap();
    app.TEST_MODE = false;
    submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });
    assert.ok(slackMethods(app).indexOf('chat.postMessage') !== -1);
  });

  it('does not match the traveller against their own just-logged trip', () => {
    const app = bootstrap();
    app.TEST_MODE = false;
    submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });
    const dm = app._recorder.slackCalls.find((call) => call.url.indexOf('chat.postMessage') !== -1);
    assert.strictEqual(JSON.parse(dm.params.payload).text.indexOf('Melissa Eisler'), -1);
  });

  it('drains the queue exactly once', () => {
    const app = bootstrap();
    app.TEST_MODE = false;
    submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });
    const firstCount = slackMethods(app).filter((method) => method === 'chat.postMessage').length;
    app.processJobQueue();
    const secondCount = slackMethods(app).filter((method) => method === 'chat.postMessage').length;
    assert.strictEqual(firstCount, 1);
    assert.strictEqual(secondCount, 1);
  });

  it('clears spent one-off triggers so the trigger quota is not consumed', () => {
    const app = bootstrap();
    submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });
    assert.strictEqual(app._recorder.triggers.length, 0);
  });

  it('logs a failing job to the Error Log instead of throwing (Decision #16)', () => {
    const app = bootstrap({
      slackResponses: {
        'users.info': MELISSA,
        'views.open': { ok: true },
        'chat.postMessage': { ok: false, error: 'channel_not_found' }
      }
    });
    app.TEST_MODE = false;
    assert.doesNotThrow(() => {
      submitAndDrain(app, { city: 'Los Angeles', start: '2026-12-01', end: '2026-12-03' });
    });
    const logged = app._recorder.appendedRows.filter(
      (entry) => entry.sheet === 'Error Log' && /channel_not_found/.test(entry.row[3]));
    assert.strictEqual(logged.length, 1);
  });
});

describe('/travel-home override (Decision #12)', () => {
  function homeSubmission(city) {
    return {
      type: 'view_submission',
      token: 'verify-token',
      user: { id: 'U_MEL' },
      view: {
        callback_id: 'cowork_compass_home',
        state: { values: { block_city: { action_city: { value: city } } } }
      }
    };
  }

  function submitHome(app, city) {
    app.doPost(slackRequest({ payload: JSON.stringify(homeSubmission(city)), token: 'verify-token' }));
    app.processJobQueue();
  }

  it('creates the Overrides row with the resolved metro cluster', () => {
    const app = bootstrap();
    submitHome(app, 'Austin');
    const grid = app._recorder.sheets.Overrides._grid;
    assert.deepStrictEqual(Array.from(grid[0]),
      ['Slack User ID', 'Email', 'Name', 'Override City', 'Override Metro Cluster', 'Last Updated']);
    assert.strictEqual(grid[1][0], 'U_MEL');
    assert.strictEqual(grid[1][2], 'Melissa Eisler');
    assert.strictEqual(grid[1][3], 'Austin');
    assert.strictEqual(grid[1][4], 'Austin Metro');
  });

  it('updates in place rather than appending on a second run', () => {
    const app = bootstrap();
    submitHome(app, 'Austin');
    submitHome(app, 'Seattle');
    const grid = app._recorder.sheets.Overrides._grid;
    assert.strictEqual(grid.length, 2, 'header plus one row');
    assert.strictEqual(grid[1][3], 'Seattle');
    assert.strictEqual(grid[1][4], 'Seattle Metro');
  });

  it('rejects an empty city', () => {
    const app = bootstrap();
    const response = app.doPost(slackRequest({
      payload: JSON.stringify(homeSubmission('  ')),
      token: 'verify-token'
    }));
    assert.strictEqual(JSON.parse(response.getContent()).errors.block_city, 'Enter a city.');
  });

  it('confirms in the agreed wording', () => {
    const app = bootstrap({
      sheetData: {
        'Test Users': [['Slack User ID', 'is_test_user'], ['U_MEL', true]]
      }
    });
    submitHome(app, 'Austin');
    const dm = app._recorder.slackCalls.find((call) => call.url.indexOf('chat.postMessage') !== -1);
    assert.strictEqual(JSON.parse(dm.params.payload).text,
      'Got it — you’re now set as based in Austin for travel matching.');
  });

  it('feeds the override back into home-base matching', () => {
    const app = bootstrap({
      sheetData: { 'Test Users': [['Slack User ID', 'is_test_user'], ['U_MEL', true]] },
      slackResponses: {
        'users.info': {
          ok: true,
          user: { id: 'U_DAN', profile: { email: 'dan@evolution.team', real_name: 'Dan Hunt' } }
        },
        'views.open': { ok: true },
        'chat.postMessage': { ok: true }
      }
    });
    app.TEST_MODE = false;

    // Dan has no public location; he sets one, then Melissa's LA trip should find him.
    app.doPost(slackRequest({
      payload: JSON.stringify({
        type: 'view_submission', token: 'verify-token', user: { id: 'U_DAN' },
        view: {
          callback_id: 'cowork_compass_home',
          state: { values: { block_city: { action_city: { value: 'Los Angeles' } } } }
        }
      }),
      token: 'verify-token'
    }));
    app.processJobQueue();

    const preview = app.previewMatch('Melissa Eisler', 'Los Angeles', '2026-12-01', '2026-12-03');
    assert.ok(preview.indexOf('Dan Hunt') !== -1, preview);
  });
});

describe('Error Log fallback', () => {
  it('records an unresolvable submitter without blocking the trip', () => {
    const app = bootstrap({
      slackResponses: {
        'users.info': {
          ok: true,
          user: { id: 'U_NEW', profile: { email: 'newhire@evolution.team', real_name: 'New Hire' } }
        },
        'views.open': { ok: true },
        'chat.postMessage': { ok: true }
      }
    });
    app.TEST_MODE = false;
    app.doPost(slackRequest({
      payload: JSON.stringify({
        type: 'view_submission', token: 'verify-token', user: { id: 'U_NEW' },
        view: {
          callback_id: 'cowork_compass_trip',
          state: {
            values: {
              block_city: { action_city: { value: 'Los Angeles' } },
              block_start: { action_start: { selected_date: '2026-12-01' } },
              block_end: { action_end: { selected_date: '2026-12-03' } },
              block_notes: { action_notes: { value: '' } }
            }
          }
        }
      }),
      token: 'verify-token'
    }));
    app.processJobQueue();

    const warned = app._recorder.appendedRows.filter(
      (entry) => entry.sheet === 'Error Log' && /not found in Directory/.test(entry.row[3]));
    assert.strictEqual(warned.length, 1);

    const grid = app._recorder.sheets['Travel Log']._grid;
    assert.strictEqual(grid[4][0], 'New Hire');

    const dm = app._recorder.slackCalls.find((call) => call.url.indexOf('chat.postMessage') !== -1);
    assert.ok(dm, 'the traveller is still notified');
  });
});
