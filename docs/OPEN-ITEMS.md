# Open items

Four things the code cannot settle on its own. The first two are the plan's own
open items. The third and fourth are problems the build surfaced — both have
working mitigations in the code, and both deserve a decision before launch.

---

## 1. Slack app registration (from the plan)

Needs Richie and/or Dan for Enterprise Grid org-level approval. Nothing in the
code is blocked on it; `slack/manifest.json` is ready to paste in.

## 2. Google account ownership (from the plan)

Unresolved. Build and test against a personal or sandbox account, then migrate
before launch.

Migration is cheap if it is planned for: the Sheet moves to the owning account,
a new Apps Script project is created under it, `clasp push` sends the same code,
the four Script Properties are re-entered, and the new `/exec` URL replaces the
old one in the Slack app. Budget an hour. The one thing that does not migrate is
the deployment URL, so the Slack app must be edited at the same time.

Worth raising with Richie explicitly: a personal account means the app dies when
that person's Google account is deprovisioned.

---

## 3. Directory has no email column — identity matching cannot work as specified

**This is the one to fix first.** Decision #5 says identity is matched via email:
Slack `users:read.email` gives the submitter's email, which is matched to the
Directory tab. The Directory tab as built has four columns — Name, Title, Home
City, Metro Cluster. There is no email anywhere in the workbook.

**What the code does now.** `resolveTraveler_` tries, in order: a Slack User ID
column on Directory, an Email column on Directory, then the submitter's Slack
profile name against the Directory name. Today only the third path can fire.
When none match, the trip is still logged under the Slack profile name, the DM
is still sent, and a warning row goes to the Error Log.

**Why the name fallback is not good enough to launch on.** It fails silently and
asymmetrically. "Norian Caporale-Berkowitz" in the Directory against "Norian C-B"
in Slack does not match; nor does a maiden name, a nickname, or an unaccented
spelling. The failure is not visible to the person — they get a DM that is
missing matches, or their trip is logged under a name nobody else's matching will
find. At 50 people, a handful of quiet mismatches is likely.

**The fix.** Add an `Email` column to the Directory tab and fill it in. The code
already looks for it (header aliases: `Email`, `Email Address`, `Work Email`) and
will prefer it the moment it exists. Then set
`CONFIG.ALLOW_NAME_FALLBACK_IDENTITY = false` so an unmatched person fails
loudly to the Error Log rather than quietly under a guessed name.

A `Slack User ID` column would be better still — it survives name and email
changes — but it is more work to populate and email is sufficient.

## 4. Slack signature verification is not possible in Apps Script

Decision #2 specifies signature verification. Apps Script Web Apps cannot do it.
`doPost(e)` receives the query string and the body and **no HTTP headers at
all**, so `X-Slack-Signature` and `X-Slack-Request-Timestamp` are unreadable.
There is no workaround inside Apps Script; this is a platform limit, not an
implementation shortcut.

**What the code does instead** (`src/10_WebApp.js`), both required, failing
closed if neither is configured:

1. `WEBAPP_SHARED_KEY` — a random string in the Web App URL as `?k=…`, known
   only to whoever configures the Slack app.
2. `SLACK_VERIFICATION_TOKEN` — Slack's legacy token, which travels in the
   request body and so *is* readable. Deprecated by Slack, still sent.

**What this is weaker than HMAC at.** It does not bind a request to its body, and
it gives no replay protection: anyone holding both secrets can forge a request,
and a captured request can be replayed. Neither secret is exposed by normal
operation — they live in the Slack app config and the Script Properties.

**Is that acceptable here?** Probably, and here is the honest case for it. The
worst an attacker with both secrets can do is log a fake trip for someone, or
cause a DM to be sent to one person. There are no credentials to steal, no money
to move, nothing destructive to trigger, and the data is a roster of cities
already published on evolution.team. The exposure is a nuisance, not a breach.

If that judgement is wrong — if this is later asked to carry anything more
sensitive — the fix is to move the endpoint off Apps Script to somewhere that
can read headers (Cloud Functions, Cloud Run, or a small Vercel handler),
verify the signature there, and have it call the Sheet. The matching logic in
`04_Matching.js` is deliberately free of Google services and would port
unchanged. That is a rewrite of the transport, not of the app.

---

## Deliberate deviations from the plan

Two places where the code does not do literally what the plan says. Both are
one-line reversals if you disagree.

### Trip overlaps match by metro cluster, not by exact city string

Decision #7 describes the trip-overlap check as "exact city-string match against
other active trips". Taken literally, Roth logging *Santa Monica* and Melissa
logging *Los Angeles* on the same dates would not match each other — even though
the home-base check treats Santa Monica and Los Angeles as one LA Metro cluster.
Same two people, same week, same place; matched one way and not the other.

The code matches trips by metro cluster when both trips have one, and falls back
to city strings when either does not — which is also what carries the unlisted-city
case the plan calls for. Set `CONFIG.TRIP_MATCH_BY_METRO_CLUSTER = false` for
strict literal behaviour; the test suite covers both.

### The match sentence ends in a full stop, not a dangling dash

Decision #13's formats end `"… are also there — "`, which is a leftover from the
version that continued "want an intro?" — the offer Decision #1 removed. The code
ends the sentence with a full stop. Everything else about the grammar, including
the Oxford comma, is as specified.
