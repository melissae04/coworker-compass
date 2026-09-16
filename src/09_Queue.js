/**
 * Deferred job queue (Decision #3).
 *
 * Slack closes a view_submission request after three seconds. Apps Script has
 * no way to return a response and keep working, so the request thread does the
 * minimum — validate, stash the job in Script Properties, arm a one-off trigger
 * — and returns. processJobQueue() then does the sheet reads, matching and DM.
 *
 * The one-off trigger normally fires within seconds. installSafetyNetTrigger()
 * adds a once-a-minute drain so a job is never stranded if trigger creation
 * fails or the one-off is dropped.
 */

/**
 * Stashes a job and arms a trigger to run it.
 * @param {!Object} job
 * @return {string} The property key the job was written to.
 */
function enqueueJob_(job) {
  var key = CONFIG.JOB_PREFIX + Date.now() + ':' + Utilities.getUuid();
  props_().setProperty(key, JSON.stringify(job));
  ScriptApp.newTrigger('processJobQueue').timeBased().after(1).create();
  return key;
}

/**
 * Trigger entry point. Drains every pending job.
 *
 * Guarded by a script lock: the one-off trigger and the safety-net trigger can
 * land at the same moment, and without the lock both would process the same job.
 */
function processJobQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    cleanupOneOffTriggers_();
    var scriptProperties = props_();
    var keys = scriptProperties.getKeys()
      .filter(function (key) { return key.indexOf(CONFIG.JOB_PREFIX) === 0; })
      .sort();

    keys.forEach(function (key) {
      var raw = scriptProperties.getProperty(key);
      // Claim the job before running it: a job that throws is logged once, not
      // retried forever against a queue that never drains.
      scriptProperties.deleteProperty(key);
      if (!raw) return;

      var job = null;
      try {
        job = JSON.parse(raw);
        runJob_(job);
      } catch (err) {
        logError_(job && job.slackUserId, (job && job.command) || 'processJobQueue', err);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Dispatches one job. Shared by the queue and by inline processing.
 * @param {!Object} job
 * @return {!Object} Handler result.
 */
function runJob_(job) {
  if (job.type === 'trip') return processTripJob_(job);
  if (job.type === 'home') return processHomeJob_(job);
  throw new Error('Unknown job type: ' + job.type);
}

/**
 * Removes spent one-off triggers so the per-script trigger limit is not hit.
 *
 * Safe to run before draining: this function only ever deletes triggers whose
 * handler is processJobQueue, and the drain below processes every pending job,
 * so no work is lost with the trigger that would have run it.
 */
function cleanupOneOffTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processJobQueue') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Installs the once-a-minute safety-net drain. Run once, by hand, from the
 * Apps Script editor. Its handler name differs from the one-off triggers' so
 * cleanupOneOffTriggers_() leaves it alone.
 */
function installSafetyNetTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'drainJobQueueSafetyNet') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('drainJobQueueSafetyNet').timeBased().everyMinutes(1).create();
}

/** Safety-net trigger target. */
function drainJobQueueSafetyNet() {
  processJobQueue();
}
