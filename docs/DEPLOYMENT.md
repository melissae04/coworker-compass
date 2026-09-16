# Deployment

Roughly 30 minutes end to end, assuming the Slack app can be registered.

## 1. Push the code to Apps Script

Either create a new Apps Script project and paste each `src/*.js` file in as a
separate script file (keeping the numeric prefixes so load order is preserved),
or use [clasp](https://github.com/google/clasp):

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "Cowork Compass" --rootDir src
cp .clasp.json.example .clasp.json   # then paste in the scriptId clasp printed
clasp push
```

Set the project timezone in `src/appsscript.json` to match the Sheet's timezone.
They are both `America/Los_Angeles` by default. If they disagree, a trip logged
late in the evening can land on the wrong calendar day.

## 2. Configure Script Properties

Project Settings → Script Properties. All four are required.

| Property | Value |
| --- | --- |
| `SHEET_ID` | The ID from the Sheet URL, between `/d/` and `/edit` |
| `SLACK_BOT_TOKEN` | `xoxb-…` from the Slack app's OAuth & Permissions page |
| `SLACK_VERIFICATION_TOKEN` | From the Slack app's Basic Information page |
| `WEBAPP_SHARED_KEY` | Any long random string you generate |

`WEBAPP_SHARED_KEY` is what makes the Web App URL unguessable in practice. Treat
it like a password: it goes in the Slack app's request URLs and nowhere else.

## 3. Create the new tabs

Run `setupSheetTabs` once from the Apps Script editor. It creates **Overrides**,
**Error Log** and **Test Users** and leaves any existing tab alone.

Then run `diagnoseSheet`. It reads every tab and reports what it found without
writing anything — number of people, how many have a location, how many have an
email, any Directory city missing from Metro Regions, any unparseable date. Fix
whatever it flags before going further.

## 4. Deploy as a Web App

Deploy → New deployment → Web app.

- **Execute as:** Me
- **Who has access:** Anyone

"Anyone" is required — Slack's servers are anonymous callers. The URL is
protected by `WEBAPP_SHARED_KEY` and the verification token, not by Google auth.

Copy the `/exec` URL. Confirm it responds by opening it in a browser; it should
return `Cowork Compass is running.`

## 5. Register the Slack app

Slack takes an Enterprise Grid org-level approval here — see
[`OPEN-ITEMS.md`](OPEN-ITEMS.md).

1. api.slack.com/apps → Create New App → From an app manifest.
2. Paste `slack/manifest.json`, replacing every `REPLACE_WITH_DEPLOYMENT_ID`
   with your deployment ID and every `REPLACE_WITH_WEBAPP_SHARED_KEY` with the
   shared key. Both the slash commands and the interactivity request URL need
   the `?k=` query string.
3. Install to the workspace and copy the bot token into `SLACK_BOT_TOKEN`.
4. Run `checkSlackAuth` from the Apps Script editor to confirm the token works.

## 6. Install the safety-net trigger

Run `installSafetyNetTrigger` once. It drains the job queue every minute in case
a one-off trigger is ever dropped. Without it, a failed trigger creation strands
a job until the next submission.

## 7. Test

1. Add yourself and Roth to the **Test Users** tab with `is_test_user` set to
   `TRUE`. `TEST_MODE` is already `true`.
2. Run `/travel` in Slack. Log a trip to Los Angeles. You should get a DM within
   a few seconds.
3. Have someone not on the test list run `/travel`. They should get nothing, and
   the DM they would have received should appear in the **Error Log** tab.
4. Run `/travel-home`, set a city, check the **Overrides** tab, then run it again
   with a different city and confirm the same row updated rather than a second
   row appearing.
5. Try a city that is not in Metro Regions and confirm the message explains it.

`previewMatch('Melissa Eisler', 'Los Angeles', '2026-11-03', '2026-11-05')` runs
the whole match against live data and returns the DM text without writing a trip
or sending anything. Use it freely.

## 8. Launch

Set `TEST_MODE = false` in `src/00_Config.js`, push, and create a **new
deployment version** — editing the code does not change what a deployed version
serves. Then announce the commands.

## Operating notes

- **Errors** land in the Error Log tab: timestamp, Slack user ID, command,
  detail. There is no alerting, by design; check it after launch and then
  occasionally.
- **Fixing a bad entry**: there is no edit or cancel command in V1. Edit the
  Travel Log row directly.
- **Adding a city**: add it to Metro Regions with its cluster. Nothing else
  needs changing.
- **New joiners**: add them to the Directory tab. Until then, their `/travel`
  trips are logged under their Slack profile name and a warning is written to
  the Error Log.
