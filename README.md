# Cowork Compass

A Slack app that tells you who else from Evolution is already in a city you are
travelling to.

Run `/travel`, log a destination and dates, and you get a private DM listing
everyone whose home base or logged travel overlaps with your trip. Run
`/travel-home` to set the city used for that matching without touching your
public bio.

It is informational only. Nothing is posted to a channel, nobody is told you are
travelling, and the app never offers to make an introduction.

```
🧳 You're in Los Angeles Nov 3–Nov 5. Matt Auron, Janine Davis, Lizzie Azzolino,
David Shechtman, Erik Kellener, John Volturo, Peter Gandolfo, Roth Herrlinger,
Samara Zelniker, Sandra Ortiz, Tracy Podell, Andrew Hapke, Gloria Synn,
Hyeon-Ju Rho, and Norian Caporale-Berkowitz are also there.
```

## How it fits together

```
Slack  ──/travel──▶  Apps Script Web App  ──views.open──▶  modal
                              │
                     submission (< 3s ack)
                              │
                       job queue (Script Properties + one-off trigger)
                              │
                     match against Google Sheet  ──chat.postMessage──▶  DM
```

Slack gives a request three seconds. Apps Script cannot return a response and
keep working, so a submission is validated, stashed and acknowledged
immediately; a trigger then does the sheet reads, the matching and the DM. See
`src/09_Queue.js`.

## Repository layout

| Path | What it is |
| --- | --- |
| `src/00_Config.js` | Tab names, header aliases, feature flags, `TEST_MODE` |
| `src/01_Text.js` | Name/city normalisation and the Oxford-comma list grammar |
| `src/02_Dates.js` | ISO date handling, overlap and active-trip rules |
| `src/03_Sheets.js` | All Sheet reads and writes, located by header text |
| `src/04_Matching.js` | The matching engine — pure functions, no Google services |
| `src/05_Messages.js` | DM copy |
| `src/06_SlackApi.js` | Slack Web API client |
| `src/07_Modals.js` | Block Kit modals |
| `src/08_Handlers.js` | Identity resolution, trip and override processing |
| `src/09_Queue.js` | Deferred job queue and its triggers |
| `src/10_WebApp.js` | `doPost` router, request authentication, validation |
| `src/11_Setup.js` | One-time setup and manual diagnostics |
| `slack/manifest.json` | Slack app manifest for registration |
| `test/` | Test suite, runnable with plain Node |

## Tests

```bash
npm test
```

No dependencies. `test/harness.js` loads the Apps Script sources into a VM
context with fake Google and Slack services, which reproduces Apps Script's
single shared global scope. Fixtures in `test/fixtures.js` are the real
Directory, Metro Regions and Travel Log data, so the suite asserts against the
numbers the prototype sheet itself reports — an LA trip returns exactly the 14
home-base matches the Matches tab counts.

## Behaviour reference

| Rule | Where |
| --- | --- |
| Informational only, no intro offers | `05_Messages.js` |
| Native date pickers, no free-text dates | `07_Modals.js` |
| Immediate ack, deferred processing | `09_Queue.js`, `10_WebApp.js` |
| Identity by Slack email | `resolveTraveler_` in `08_Handlers.js` |
| Override → Directory → unmatched | `resolveLocation_` in `04_Matching.js` |
| Metro Regions is the clustering source of truth | `lookupCluster_` in `04_Matching.js` |
| Unlisted city: trip check still runs, home check skipped | `computeMatches_`, `buildTripMessage_` |
| Overlap includes shared edge days | `datesOverlap_` in `02_Dates.js` |
| Past trips retained but not matched | `isActiveTrip_` in `02_Dates.js` |
| One merged, deduplicated, uncapped name list | `computeMatches_`, `joinNames_` |
| `/travel-home` updates in place | `upsertOverride_` in `03_Sheets.js` |
| Errors written to the Error Log tab | `logError_` in `03_Sheets.js` |
| Test-mode DM suppression | `TEST_MODE` in `00_Config.js`, `deliverDm_` |

## Before launch

`TEST_MODE` at the top of `src/00_Config.js` is `true`. While it is on, matching
runs against the full real Directory and Travel Log, but only people flagged in
the Test Users tab actually receive a DM — everyone else's message is written to
the Error Log instead. Set it to `false` to go live.

Two things still need resolving outside the code. Read
[`docs/OPEN-ITEMS.md`](docs/OPEN-ITEMS.md) before deploying — one of them
changes what the Directory tab has to contain.

Deployment steps are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
