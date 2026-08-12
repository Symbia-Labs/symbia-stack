# Browser walk — predictions, registered before measuring

*10 August 2026. Written and committed BEFORE the console was opened. Results go
in a separate results document so this one cannot be quietly edited to match
what happened.*

*Standing task from the project instructions: "Walk it screen by screen in the
order a user meets them, in a browser, on 8000. Record what it does. Register
predictions before measuring. 'Not checked' is a legitimate result and beats a
green one that was inferred."*

---

## 0. Conditions at the start

Measured immediately before writing this, and stated so the results can be
read against the right baseline:

- Stack brought up with `COMPOSE_FILE="docker-compose.yml:docker-compose.dev.yml"`.
- `symbia_stack_health` reports **11/11 healthy**.
- All nine service bundles rebuilt today; verified by grepping the marker
  `role_claimed` inside each *running* container.
- `npm run check` fails with **159 TypeScript errors**, none in code added
  today. The console is therefore being walked in a state where the typecheck
  gate is off. This is a fact about the walk, not an excuse for its results.
- Postgres volume persisted, so `dev@example.com` and existing data survive.
- The Electron spyglass agent is the **only** surface not rebuilt today. Its
  instrument key was rotated onto the alpha2 genesis this afternoon and reports
  `attested`.

## 1. Console — first contact (browser, `http://localhost:8000`)

| # | Prediction |
|---|---|
| C1 | The console loads and renders without a blank screen or an unhandled error in the devtools console. |
| C2 | Login is not required — `DEV_NO_AUTH` defaults to `false`, so I expect a login screen, and I expect `dev@example.com` / `password123` to work. |
| C3 | The Overview shows 12 services including `directory`, all healthy, with no tile reporting a count of `0` that means "never asked". |
| C4 | Every left-nav destination renders something — no blank panels, no infinite spinners. |
| C5 | **Expected to break.** At least one panel shows a confident `0` or an empty state that is actually a failed fetch. With 159 typecheck errors outstanding and nine services rebuilt against new libraries, I do not believe every panel survives untouched. |

## 2. Chat

| # | Prediction |
|---|---|
| H1 | A conversation opens and a message can be sent. |
| H2 | A reply comes back and is streamed into the view — the join-storm and never-streamed-back defects fixed earlier remain fixed. |
| H3 | Group replies show participant name and per-participant colour on every message. |
| H4 | A calculation via the calc assistant returns the bare result with no provenance suffix padding the message. |
| H5 | The provenance receipt renders, showing arena and a seal. **Now interesting:** `assistants` restarted today with `NETWORK_HASH_SECRET` set for the first time, so envelopes are being sealed with a different secret than any previously stored reply. I predict old replies still display, because the console renders `hash` without verifying it. |
| H6 | **Expected to break.** Something in the assistant path fails on first use — most likely an integrations or model call, because that whole path is freshly rebuilt and has not been exercised since. |

## 3. Spyglass in the console (browser)

| # | Prediction |
|---|---|
| B1 | The glass panel opens and the aperture renders over the console. |
| B2 | A capture reaches the vision endpoint through the integrations gateway, with `X-Org-Id` sent — the refusal fixed earlier does not return. |
| B3 | A description comes back and is displayed. |
| B4 | **Expected to break.** The vision call fails or refuses. It depends on a provider credential resolved through identity, an org context, and a freshly rebuilt integrations service — three things that have each broken separately before. |

## 4. Spyglass as the native Electron agent

The only surface not rebuilt today, and the only one that captures outside a
browser.

| # | Prediction |
|---|---|
| E1 | The app launches and the overlay appears over the whole desktop, click-through except on the ring. |
| E2 | It boots as `spyglass:instrument:a45045d89b53d8e6` at level `attested`, unchanged by anything done to the stack today — its identity lives in the app's own data directory, not in a container. |
| E3 | The four gestures still work: tap for a still, hold for video, tap-then-hold for video with audio, tap-tap for audio only. |
| E4 | A clip recorded now verifies with `verify-clip.mjs`, and with `--genesis` it reports `attested`. |
| E5 | A clip recorded now, verified against a clip recorded this afternoon, shows both chains independently valid — nothing about the stack rebuild touches the instrument. |
| E6 | **Expected to break.** Nothing, and that is the point of stating it: this component shares no code with the platform and was not rebuilt, so if anything here has changed, my model of what is coupled to what is wrong. A failure here is more informative than a failure anywhere else in this document. |

## 5. What "not checked" means here

Any row that cannot be exercised — because a credential is absent, because a
screen needs data that does not exist, because a gesture needs a human hand —
is recorded as **not checked**. It is not recorded as passing, and it is not
recorded as failing. The results document will have three columns for that
reason.

## 6. Method

- Browser, never curl, for anything user-facing.
- Devtools console open throughout; errors recorded verbatim as observations,
  with any diagnosis marked separately as inference.
- Screenshots for anything visual that is disputed.
- Interactions requiring a human hand are performed by the operator and
  recorded as such, since the assistant cannot press a key on the host.
