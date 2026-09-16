/**
 * Cowork Compass — configuration.
 *
 * Secrets never live in this file. They live in Script Properties
 * (Apps Script editor → Project Settings → Script Properties), so this
 * repository stays safe to share.
 *
 * Required Script Properties:
 *   SHEET_ID                  Google Sheet ID holding the Directory / Travel Log / ... tabs
 *   SLACK_BOT_TOKEN           xoxb-... bot token
 *   SLACK_VERIFICATION_TOKEN  Legacy verification token from the Slack app's Basic Information page
 *   WEBAPP_SHARED_KEY         Random string; appended to the Web App URL as ?k=<value>
 */

/** Master kill switch for real DMs. Set to false at launch (Decision #17). */
var TEST_MODE = true;

var CONFIG = {
  /**
   * Decision #3. When true, a view submission is acknowledged instantly and the
   * matching + DM work is handed to a one-off trigger. When false the work runs
   * inline, which is simpler to debug but risks Slack's 3-second timeout.
   */
  DEFER_PROCESSING: true,

  /**
   * DEVIATION FROM PLAN — see docs/OPEN-ITEMS.md.
   * Decision #7 describes trip-overlap matching as "exact city-string match".
   * Taken literally, a trip to "Santa Monica" would not match a trip to
   * "Los Angeles" even though home-base matching clusters them together.
   * With this true, two trips match when their metro clusters match, falling
   * back to city strings when either trip has no cluster. Set to false for
   * strict literal-plan behaviour.
   */
  TRIP_MATCH_BY_METRO_CLUSTER: true,

  /**
   * Identity resolution. Email is primary (Decision #5). The Directory tab as
   * built has no Email column, so name matching is kept as a fallback; see
   * docs/OPEN-ITEMS.md.
   */
  ALLOW_NAME_FALLBACK_IDENTITY: true,

  /** Tab names, matching the prototype sheet. */
  TABS: {
    DIRECTORY: 'Directory',
    METRO_REGIONS: 'Metro Regions',
    TRAVEL_LOG: 'Travel Log',
    OVERRIDES: 'Overrides',
    ERROR_LOG: 'Error Log',
    TEST_USERS: 'Test Users'
  },

  /**
   * Header aliases, resolved case- and space-insensitively. The first header
   * found in a tab wins, so the sheet can be relabelled without touching code.
   */
  HEADERS: {
    DIRECTORY: {
      name: ['Name', 'Full Name'],
      title: ['Title', 'Role'],
      city: ['Home City', 'City', 'Location'],
      cluster: ['Metro Cluster', 'Cluster', 'Metro'],
      email: ['Email', 'Email Address', 'Work Email'],
      slackUserId: ['Slack User ID', 'Slack ID']
    },
    METRO_REGIONS: {
      city: ['City', 'Location'],
      cluster: ['Metro Cluster', 'Cluster', 'Metro']
    },
    TRAVEL_LOG: {
      name: ['Traveler Name', 'Traveller Name', 'Name'],
      city: ['Destination City', 'Destination', 'City'],
      cluster: ['Metro Cluster', 'Cluster', 'Metro'],
      startDate: ['Start Date', 'Start'],
      endDate: ['End Date', 'End'],
      notes: ['Notes', 'Note']
    },
    OVERRIDES: {
      slackUserId: ['Slack User ID', 'Slack ID'],
      email: ['Email', 'Email Address'],
      name: ['Name', 'Directory Name', 'Full Name'],
      city: ['Override City', 'City'],
      cluster: ['Override Metro Cluster', 'Metro Cluster', 'Cluster'],
      updatedAt: ['Last Updated', 'Updated At', 'Updated']
    },
    TEST_USERS: {
      slackUserId: ['Slack User ID', 'Slack ID'],
      email: ['Email', 'Email Address'],
      isTestUser: ['is_test_user', 'Is Test User', 'Test User']
    }
  },

  /** Column layouts used when a tab has to be created from scratch. */
  NEW_TAB_HEADERS: {
    OVERRIDES: ['Slack User ID', 'Email', 'Name', 'Override City', 'Override Metro Cluster', 'Last Updated'],
    ERROR_LOG: ['Timestamp', 'Slack User ID', 'Command', 'Error Message'],
    TEST_USERS: ['Slack User ID', 'Email', 'is_test_user', 'Note']
  },

  /** Slack modal identifiers. Referenced by both the modal builders and handlers. */
  MODAL: {
    TRIP_CALLBACK_ID: 'cowork_compass_trip',
    HOME_CALLBACK_ID: 'cowork_compass_home',
    BLOCK_CITY: 'block_city',
    ACTION_CITY: 'action_city',
    BLOCK_START: 'block_start',
    ACTION_START: 'action_start',
    BLOCK_END: 'block_end',
    ACTION_END: 'action_end',
    BLOCK_NOTES: 'block_notes',
    ACTION_NOTES: 'action_notes'
  },

  COMMANDS: {
    TRAVEL: '/travel',
    TRAVEL_HOME: '/travel-home'
  },

  /** Property key prefix for the deferred job queue. */
  JOB_PREFIX: 'job:',

  /** Values that mean "no location recorded" in the Directory snapshot. */
  BLANK_LOCATION_MARKERS: ['—', '-', '–', 'n/a', 'na', 'none', '— not public —', 'not public']
};

/** @return {!Object} Script Properties as a plain object. */
function props_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Reads a required Script Property.
 * @param {string} key
 * @return {string}
 */
function requireProp_(key) {
  var value = props_().getProperty(key);
  if (!value) {
    throw new Error('Missing Script Property "' + key + '". See docs/DEPLOYMENT.md.');
  }
  return value;
}

/**
 * Reads an optional Script Property.
 * @param {string} key
 * @param {string=} fallback
 * @return {string}
 */
function optionalProp_(key, fallback) {
  var value = props_().getProperty(key);
  return value ? value : (fallback === undefined ? '' : fallback);
}
