/**
 * Slack Web API client.
 *
 * Thin wrapper over UrlFetchApp. Every call returns the parsed response and
 * throws on `ok: false` so failures land in the Error Log rather than being
 * silently dropped (Decision #16).
 */

var SLACK_API_BASE = 'https://slack.com/api/';

/**
 * @param {string} method Slack API method, e.g. 'chat.postMessage'.
 * @param {!Object} payload JSON body.
 * @return {!Object} Parsed Slack response.
 */
function slackPost_(method, payload) {
  var response = UrlFetchApp.fetch(SLACK_API_BASE + method, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Bearer ' + requireProp_('SLACK_BOT_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var body = parseSlackResponse_(response.getContentText(), method);
  if (!body.ok) {
    throw new Error('Slack ' + method + ' failed: ' + (body.error || 'unknown_error'));
  }
  return body;
}

/**
 * @param {string} method
 * @param {!Object<string, string>} params Query parameters.
 * @return {!Object}
 */
function slackGet_(method, params) {
  var query = Object.keys(params || {})
    .map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    })
    .join('&');

  var response = UrlFetchApp.fetch(SLACK_API_BASE + method + (query ? '?' + query : ''), {
    method: 'get',
    headers: { Authorization: 'Bearer ' + requireProp_('SLACK_BOT_TOKEN') },
    muteHttpExceptions: true
  });

  var body = parseSlackResponse_(response.getContentText(), method);
  if (!body.ok) {
    throw new Error('Slack ' + method + ' failed: ' + (body.error || 'unknown_error'));
  }
  return body;
}

/**
 * @param {string} text
 * @param {string} method
 * @return {!Object}
 */
function parseSlackResponse_(text, method) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Slack ' + method + ' returned non-JSON: ' + String(text).slice(0, 300));
  }
}

/**
 * Opens a modal. Must happen within three seconds of the slash command, because
 * that is how long a trigger_id stays valid.
 * @param {string} triggerId
 * @param {!Object} view
 * @return {!Object}
 */
function slackViewsOpen_(triggerId, view) {
  return slackPost_('views.open', { trigger_id: triggerId, view: view });
}

/**
 * Sends a DM. Posting to a user ID opens (or reuses) the app's DM channel.
 * @param {string} slackUserId
 * @param {string} text
 * @return {!Object}
 */
function slackPostDm_(slackUserId, text) {
  return slackPost_('chat.postMessage', {
    channel: slackUserId,
    text: text,
    unfurl_links: false,
    unfurl_media: false
  });
}

/**
 * Looks up a Slack user's profile. Requires the users:read and
 * users:read.email scopes (Decision #5).
 * @param {string} slackUserId
 * @return {{id: string, email: string, realName: string, displayName: string}}
 */
function slackGetUser_(slackUserId) {
  var body = slackGet_('users.info', { user: slackUserId });
  var user = body.user || {};
  var profile = user.profile || {};
  return {
    id: user.id || slackUserId,
    email: cleanText_(profile.email).toLowerCase(),
    realName: cleanText_(profile.real_name || user.real_name),
    displayName: cleanText_(profile.display_name || user.name)
  };
}
