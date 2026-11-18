/**
 * Block Kit modal definitions.
 *
 * Decision #16 — dates are collected with Slack's native date pickers rather
 * than free text, which removes malformed-date input as a failure mode
 * entirely. The only remaining date error is an end date before a start date,
 * which is validated on submission.
 */

/**
 * The /travel modal: destination city, start date, end date, optional notes.
 * @param {string=} initialDateIso Defaults to today.
 * @return {!Object} A Slack view payload.
 */
function buildTripModal_(initialDateIso) {
  var today = initialDateIso || todayIso_();
  var M = CONFIG.MODAL;

  return {
    type: 'modal',
    callback_id: M.TRIP_CALLBACK_ID,
    title: { type: 'plain_text', text: 'Log a trip' },
    submit: { type: 'plain_text', text: 'Log it' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: 'You’ll get a DM listing anyone based in or travelling to the same place.'
        }]
      },
      {
        type: 'input',
        block_id: M.BLOCK_CITY,
        label: { type: 'plain_text', text: 'Destination city' },
        element: {
          type: 'plain_text_input',
          action_id: M.ACTION_CITY,
          placeholder: { type: 'plain_text', text: 'Los Angeles' },
          max_length: 80
        }
      },
      {
        type: 'input',
        block_id: M.BLOCK_START,
        label: { type: 'plain_text', text: 'Start date' },
        element: {
          type: 'datepicker',
          action_id: M.ACTION_START,
          initial_date: today
        }
      },
      {
        type: 'input',
        block_id: M.BLOCK_END,
        label: { type: 'plain_text', text: 'End date' },
        element: {
          type: 'datepicker',
          action_id: M.ACTION_END,
          initial_date: today
        }
      },
      {
        type: 'input',
        block_id: M.BLOCK_NOTES,
        optional: true,
        label: { type: 'plain_text', text: 'Notes' },
        element: {
          type: 'plain_text_input',
          action_id: M.ACTION_NOTES,
          max_length: 200
        }
      }
    ]
  };
}

/**
 * The /travel-home modal: a single city field (Decision #12).
 * @param {string=} currentCity Pre-filled when an override already exists.
 * @return {!Object} A Slack view payload.
 */
function buildHomeModal_(currentCity) {
  var M = CONFIG.MODAL;
  var element = {
    type: 'plain_text_input',
    action_id: M.ACTION_CITY,
    placeholder: { type: 'plain_text', text: 'San Diego' },
    max_length: 80
  };
  if (currentCity) element.initial_value = currentCity;

  return {
    type: 'modal',
    callback_id: M.HOME_CALLBACK_ID,
    title: { type: 'plain_text', text: 'Set your home base' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: 'Used for travel matching only. Your public bio is untouched.'
        }]
      },
      {
        type: 'input',
        block_id: M.BLOCK_CITY,
        label: { type: 'plain_text', text: 'City' },
        element: element
      }
    ]
  };
}

/**
 * Shown in place of a form once it has been accepted.
 * @param {string} title Modal title, 24 characters at most.
 * @param {string} summary First line, mrkdwn.
 * @return {!Object} A Slack view payload.
 */
function buildConfirmationModal_(title, summary) {
  return {
    type: 'modal',
    title: { type: 'plain_text', text: title },
    close: { type: 'plain_text', text: 'Done' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: summary + '\n\nCowork Compass will message you within a minute. ' +
            'Look under *Apps* in your Slack sidebar.'
        }
      }
    ]
  };
}

/**
 * Reads a value out of a view_submission's state object.
 * @param {!Object} view
 * @param {string} blockId
 * @param {string} actionId
 * @return {!Object} The raw element state, or {} when absent.
 */
function readViewValue_(view, blockId, actionId) {
  var values = (view && view.state && view.state.values) || {};
  var block = values[blockId] || {};
  return block[actionId] || {};
}
