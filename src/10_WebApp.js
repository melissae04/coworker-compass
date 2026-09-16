/**
 * Web App entry points — the URL Slack talks to.
 *
 * REQUEST AUTHENTICATION, AND WHY IT IS NOT HMAC
 * ----------------------------------------------
 * Decision #2 calls for Slack signature verification. An Apps Script Web App
 * cannot do it: doPost(e) is handed the query string and the body, and no HTTP
 * headers at all, so X-Slack-Signature and X-Slack-Request-Timestamp are simply
 * not readable. There is no workaround within Apps Script.
 *
 * Two body/URL-level checks stand in for it, and both must pass when configured:
 *   1. WEBAPP_SHARED_KEY  — a random string appended to the Web App URL as ?k=,
 *      known only to whoever configures the Slack app.
 *   2. SLACK_VERIFICATION_TOKEN — Slack's legacy token, which travels in the
 *      request body and so is readable here. Deprecated by Slack but not removed.
 *
 * This is weaker than HMAC: it does not bind the request to its body or give
 * replay protection. See docs/OPEN-ITEMS.md for what to do if that is not
 * acceptable.
 */

/**
 * Health check. Useful for confirming a deployment is live before pointing
 * Slack at it.
 * @return {!TextOutput}
 */
function doGet() {
  return ContentService.createTextOutput('Cowork Compass is running.');
}

/**
 * Slack's single entry point: slash commands and interactivity both land here.
 * @param {!Object} e Apps Script event object.
 * @return {!TextOutput}
 */
function doPost(e) {
  var params;
  try {
    params = parseRequestParams_(e);
    assertAuthentic_(params);
  } catch (err) {
    // Nothing is trusted yet, so this is not written to the Error Log, which
    // anyone who found the URL could then flood.
    console.error('Rejected request: ' + err);
    return ackEmpty_();
  }

  try {
    if (params.payload) return routeInteraction_(params);
    if (params.command) return routeSlashCommand_(params);
    return ackEmpty_();
  } catch (err) {
    logError_(params.user_id || '', params.command || 'doPost', err);
    return ackEmpty_();
  }
}

/**
 * Merges query-string and form-body parameters.
 * @param {!Object} e
 * @return {!Object<string, string>}
 */
function parseRequestParams_(e) {
  var params = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (key) { params[key] = e.parameter[key]; });
  }
  // Apps Script normally parses a urlencoded body into e.parameter, but it
  // skips bodies whose content type it does not recognise, so parse by hand
  // when the fields we need are missing.
  if (!params.payload && !params.command && e && e.postData && e.postData.contents) {
    parseFormBody_(e.postData.contents, params);
  }
  return params;
}

/**
 * @param {string} body application/x-www-form-urlencoded body.
 * @param {!Object<string, string>} target Mutated in place.
 */
function parseFormBody_(body, target) {
  String(body).split('&').forEach(function (pair) {
    if (!pair) return;
    var splitAt = pair.indexOf('=');
    var rawKey = splitAt < 0 ? pair : pair.slice(0, splitAt);
    var rawValue = splitAt < 0 ? '' : pair.slice(splitAt + 1);
    var key = safeDecode_(rawKey);
    if (key && target[key] === undefined) target[key] = safeDecode_(rawValue);
  });
}

/**
 * @param {string} value
 * @return {string}
 */
function safeDecode_(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch (err) {
    return String(value);
  }
}

/**
 * Fails closed: if neither check is configured, no request is accepted.
 * @param {!Object<string, string>} params
 */
function assertAuthentic_(params) {
  var sharedKey = optionalProp_('WEBAPP_SHARED_KEY');
  var verificationToken = optionalProp_('SLACK_VERIFICATION_TOKEN');

  if (!sharedKey && !verificationToken) {
    throw new Error('Neither WEBAPP_SHARED_KEY nor SLACK_VERIFICATION_TOKEN is set; ' +
      'refusing all requests. See docs/DEPLOYMENT.md.');
  }
  if (sharedKey && !constantTimeEquals_(params.k || '', sharedKey)) {
    throw new Error('Shared key mismatch.');
  }
  if (verificationToken) {
    var token = params.token || readPayloadToken_(params.payload);
    if (!constantTimeEquals_(token || '', verificationToken)) {
      throw new Error('Verification token mismatch.');
    }
  }
}

/**
 * Interactivity payloads carry the verification token inside the JSON rather
 * than as a form field.
 * @param {string|undefined} payload
 * @return {string}
 */
function readPayloadToken_(payload) {
  if (!payload) return '';
  try {
    return JSON.parse(payload).token || '';
  } catch (err) {
    return '';
  }
}

/**
 * Length-independent comparison, so a mismatch reveals nothing through timing.
 * @param {string} a
 * @param {string} b
 * @return {boolean}
 */
function constantTimeEquals_(a, b) {
  var left = String(a);
  var right = String(b);
  var length = Math.max(left.length, right.length);
  var diff = left.length ^ right.length;
  for (var i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Slash commands must open their modal inside the request, because a trigger_id
 * is only valid for three seconds and cannot be handed to a later trigger.
 * @param {!Object<string, string>} params
 * @return {!TextOutput}
 */
function routeSlashCommand_(params) {
  var command = cleanText_(params.command).toLowerCase();

  if (command === CONFIG.COMMANDS.TRAVEL) {
    slackViewsOpen_(params.trigger_id, buildTripModal_());
    return ackEmpty_();
  }
  if (command === CONFIG.COMMANDS.TRAVEL_HOME) {
    slackViewsOpen_(params.trigger_id, buildHomeModal_());
    return ackEmpty_();
  }

  return ackEphemeral_('Unknown command: ' + command);
}

/**
 * @param {!Object<string, string>} params
 * @return {!TextOutput}
 */
function routeInteraction_(params) {
  var payload = JSON.parse(params.payload);
  if (payload.type !== 'view_submission') return ackEmpty_();

  var callbackId = payload.view && payload.view.callback_id;
  if (callbackId === CONFIG.MODAL.TRIP_CALLBACK_ID) return handleTripSubmit_(payload);
  if (callbackId === CONFIG.MODAL.HOME_CALLBACK_ID) return handleHomeSubmit_(payload);
  return ackEmpty_();
}

/**
 * Validates the trip form and queues the real work.
 * @param {!Object} payload
 * @return {!TextOutput}
 */
function handleTripSubmit_(payload) {
  var M = CONFIG.MODAL;
  var view = payload.view;
  var city = cleanText_(readViewValue_(view, M.BLOCK_CITY, M.ACTION_CITY).value);
  var startIso = cleanText_(readViewValue_(view, M.BLOCK_START, M.ACTION_START).selected_date);
  var endIso = cleanText_(readViewValue_(view, M.BLOCK_END, M.ACTION_END).selected_date);
  var notes = cleanText_(readViewValue_(view, M.BLOCK_NOTES, M.ACTION_NOTES).value);

  var errors = {};
  if (!city) errors[M.BLOCK_CITY] = 'Enter a destination city.';
  if (!startIso) errors[M.BLOCK_START] = 'Pick a start date.';
  if (!endIso) errors[M.BLOCK_END] = 'Pick an end date.';
  if (startIso && endIso && endIso < startIso) {
    errors[M.BLOCK_END] = 'The end date is before the start date.';
  }
  if (Object.keys(errors).length) return ackErrors_(errors);

  return queueOrRun_({
    type: 'trip',
    command: CONFIG.COMMANDS.TRAVEL,
    slackUserId: payload.user.id,
    city: city,
    startIso: startIso,
    endIso: endIso,
    notes: notes
  });
}

/**
 * Validates the home-base form and queues the upsert.
 * @param {!Object} payload
 * @return {!TextOutput}
 */
function handleHomeSubmit_(payload) {
  var M = CONFIG.MODAL;
  var city = cleanText_(readViewValue_(payload.view, M.BLOCK_CITY, M.ACTION_CITY).value);

  if (!city) {
    var errors = {};
    errors[M.BLOCK_CITY] = 'Enter a city.';
    return ackErrors_(errors);
  }

  return queueOrRun_({
    type: 'home',
    command: CONFIG.COMMANDS.TRAVEL_HOME,
    slackUserId: payload.user.id,
    city: city
  });
}

/**
 * Hands a job to the queue, or runs it inline when deferral is switched off.
 * A queue failure falls back to inline rather than dropping the job.
 * @param {!Object} job
 * @return {!TextOutput}
 */
function queueOrRun_(job) {
  if (CONFIG.DEFER_PROCESSING) {
    try {
      enqueueJob_(job);
      return ackEmpty_();
    } catch (err) {
      logError_(job.slackUserId, job.command, 'Enqueue failed, running inline: ' + err);
    }
  }
  try {
    runJob_(job);
  } catch (err) {
    logError_(job.slackUserId, job.command, err);
  }
  return ackEmpty_();
}

/**
 * An empty 200 closes the modal and satisfies Slack's acknowledgement.
 * @return {!TextOutput}
 */
function ackEmpty_() {
  return ContentService.createTextOutput('');
}

/**
 * Keeps the modal open and shows a message under the offending input.
 * @param {!Object<string, string>} errors block_id -> message.
 * @return {!TextOutput}
 */
function ackErrors_(errors) {
  return ContentService
    .createTextOutput(JSON.stringify({ response_action: 'errors', errors: errors }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Replies to a slash command with a message only the caller sees.
 * @param {string} text
 * @return {!TextOutput}
 */
function ackEphemeral_(text) {
  return ContentService
    .createTextOutput(JSON.stringify({ response_type: 'ephemeral', text: text }))
    .setMimeType(ContentService.MimeType.JSON);
}
