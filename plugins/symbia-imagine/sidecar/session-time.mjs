/**
 * Placement inside a session envelope, derived rather than read from a clock.
 *
 * THE DISTINCTION THIS RESTS ON. A wall-clock reading is apocryphal: nothing in
 * the record lets you compute it again. An ESTIMATE of that reading is
 * canonical, because it is a function of the record — same ledger in, same
 * value out, for anyone holding it. Those are different claims about different
 * objects, and conflating them is what makes 89 ISO timestamps sitting in a
 * ledger look like 89 facts.
 *
 * So `estimatedAt` ships a recipe, and ships `does_not_assert` beside it. The
 * estimate is canonical. It does not assert that the event occurred then.
 *
 * WHAT THE ESTIMATOR REFUSES TO ASSUME. Interpolating uniformly over N events
 * assumes a uniform rate, and the rate is not uniform — in a real ledger a
 * login took 75ms and the next catalog write took 5ms. Every mutation already
 * records its own measured `ms`, so those durations are laid down as known
 * quantities and only the RESIDUAL is distributed:
 *
 *     residual = (t_stop - t_start) - sum(measured ms)
 *
 * The residual is idle time nobody measured. Distributing it is the one
 * assumption in here, it is named `residualPolicy`, and it travels in the
 * receipt so a reader can disagree with it by recomputing under another.
 */

/** Identity of this estimator. Part of the recipe: a different id, a different value. */
export const ESTIMATOR_ID = "symbia.session.placement/1.0.0";

/**
 * Distribution policies for the unmeasured remainder.
 *
 *   uniform      spread the residual equally across the N gaps. Simple, and
 *                wrong wherever a session sat idle at one point rather than
 *                throughout — which is the normal shape of a human session.
 *   proportional spread it in proportion to each gap's measured work. Assumes
 *                idle time follows activity, which is a different wrong.
 *
 * Neither is right. Naming both, and recording which ran, is the part that
 * matters: an estimate under a stated policy can be argued with.
 */
export const RESIDUAL_POLICIES = ["uniform", "proportional"];

/**
 * Derive placement for every event between two anchors.
 *
 * @param {object} frame
 * @param {number} frame.startMs  t(0), epoch ms — an apocryphal reading
 * @param {number} frame.stopMs   t(end), epoch ms — an apocryphal reading
 * @param {number[]} frame.durations  measured ms per event, in seq order
 * @param {string} [frame.residualPolicy]
 * @returns {{ placements: {seq:number, estimatedAtMs:number}[], receipt: object }}
 */
export function placeEvents({ startMs, stopMs, durations, residualPolicy = "uniform" }) {
  const n = durations.length;
  const envelope = stopMs - startMs;
  const measured = durations.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const residual = envelope - measured;

  // A residual below zero means the measured durations do not fit inside the
  // envelope — overlapping work, a clock that moved, or an incomplete ledger.
  // Reported, not clamped: an estimator that quietly squeezes an impossible
  // input into a plausible answer is worse than one that says it cannot.
  const feasible = residual >= 0;

  const weights =
    residualPolicy === "proportional" && measured > 0
      ? durations.map((d) => (Number.isFinite(d) ? d : 0) / measured)
      : durations.map(() => 1 / Math.max(n, 1));

  const placements = [];
  let cursor = startMs;
  for (let i = 0; i < n; i += 1) {
    // Each event is placed at the START of its own measured work, after every
    // preceding event's work and its share of the idle time.
    placements.push({ seq: i + 1, estimatedAtMs: Math.round(cursor) });
    cursor += (Number.isFinite(durations[i]) ? durations[i] : 0) + (feasible ? residual * weights[i] : 0);
  }

  return {
    placements,
    feasible,
    receipt: {
      kind: "recipe",
      source: ESTIMATOR_ID,
      recipe: {
        operation: `${ESTIMATOR_ID}(${residualPolicy})`,
        inputs: { startMs, stopMs, n, measuredMs: measured, residualMs: residual, residualPolicy },
      },
      does_not_assert:
        "that any event occurred at the time given. The estimate is recomputable from the " +
        "ledger; the moment it estimates was never recorded and cannot be recovered from it.",
    },
  };
}

/**
 * Read the anchors and durations out of a ledger, then place its events.
 *
 * Anchors come from `imagine.session.opened` and the closing event. A ledger
 * carrying neither cannot be placed, and says so rather than falling back to
 * the first and last event's timestamps — which would silently define the
 * envelope as the interval that happens to contain every event, an interval
 * with no error by construction.
 */
export function placeLedger(events, { residualPolicy = "uniform" } = {}) {
  const opened = events.find((e) => e.event_type === "imagine.session.opened");
  const closed = [...events].reverse().find(
    (e) => e.event_type === "imagine.session.closed" || e.event_type === "imagine.session.sealed"
  );
  if (!opened || !closed) {
    return {
      placed: false,
      reason: `cannot place: ${!opened ? "no opening anchor" : ""}${!opened && !closed ? " and " : ""}${!closed ? "no closing anchor" : ""}`,
    };
  }
  const durations = events.map((e) => Number(e.payload?.ms ?? 0));
  const out = placeEvents({
    startMs: Date.parse(opened.timestamp),
    stopMs: Date.parse(closed.timestamp),
    durations,
    residualPolicy,
  });
  return { placed: true, ...out };
}
