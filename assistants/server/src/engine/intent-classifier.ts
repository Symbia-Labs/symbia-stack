/**
 * The middle tier: reproducible, and robust to paraphrase.
 *
 * `docs/2026-08-11-lean-deterministic.md` originally treated any model as
 * apocryphal, which deleted the tier that does most of the work. A trained
 * DISCRIMINATIVE classifier with argmax decoding is exactly as reproducible as
 * a regex — same input, same weights, same output — while absorbing phrasing a
 * pattern list can never enumerate. What broke reproducibility was sampling
 * from a generative model, not machine learning.
 *
 * This is multinomial naive Bayes over word unigrams and character trigrams,
 * trained at load time from the example phrases each assistant declares. No
 * dependency, no service call, no network, microseconds per decision.
 *
 * WHY THIS SHAPE, and it is not novelty: Snips' NLU pipeline tried a
 * deterministic parser built from the training phrases and fell back to a
 * probabilistic one built from the SAME phrases, on-device, in 2017. Both
 * tiers here are derived from one declaration for the same reason — two
 * sources of truth for what an assistant handles is the forked-concern defect
 * this codebase keeps producing.
 *
 * REPRODUCIBILITY IS CLAIMED AND CHECKABLE. `trainingDigest` is a hash of the
 * exact examples the weights came from, canonically serialised. A receipt
 * citing it can be re-derived by anyone holding the same declarations, which
 * is the same standard the model digests in `models/` are held to. Retraining
 * on different examples produces a different digest and a visibly different
 * decision — not a silent one.
 */
import { createHash } from 'node:crypto';

export interface ClassifierDecision {
  assistant: string;
  /** Normalised probability of the winner, 0..1. */
  confidence: number;
  /** Gap to the runner-up. A win by a hair is not a win. */
  margin: number;
  runnerUp?: string;
  trainingDigest: string;
  method: 'classifier';
}

interface TrainedClass {
  key: string;
  counts: Map<string, number>;
  total: number;
  docs: number;
}

/**
 * The out-of-domain class, and why it is not optional.
 *
 * A naive Bayes over N in-domain classes MUST pick one of them. With only
 * Calculator and Smart Calculator trained, "tell me a joke about snails" was
 * routed to Calculator with high confidence — measured 11 Aug 2026, as a
 * regression the classifier tier introduced on its first run. The model was
 * not wrong; it was asked a question with no correct answer available.
 *
 * A classifier that always answers has stopped being evidence. `__none__` gives
 * it somewhere honest to put things, and when it wins the router declines —
 * which restores the refusal the pattern tier had for free by simply not
 * matching.
 *
 * This is the "out of scope" intent every production intent classifier ends up
 * needing. Kept in code rather than in a declaration because it describes what
 * this DEPLOYMENT does not do, not what any one assistant handles — and
 * assistants may add to it via `routing.negativeExamples`.
 */
export const NONE_CLASS = '__none__';

const DEFAULT_NEGATIVES = [
  'tell me a joke',
  'tell me a joke about snails',
  'write me a poem',
  'what is the weather',
  'who won the world cup',
  'hello',
  'hi how are you',
  'thanks',
  'what do you think about politics',
  'summarise this article',
  'send an email to my team',
  'what time is it',
  'translate this into french',
  'recommend a restaurant',
  'tell me a story',
  'what is the capital of france',
  // REACTIONS. Praise is a turn type, and it was missing.
  //
  // Found in the browser, 11 Aug: "that was fast1" — an acknowledgement with a
  // typo'd digit — matched no pattern, fell to the classifier, and with only
  // calculator and smart-calc to choose from the stray `1` made it look like
  // arithmetic. Calculator then choked on `wasfast1`.
  //
  // The classifier was not wrong so much as cornered: a conversational turn
  // with no conversational class to put it in. Same lesson as `tell me a joke`
  // going to Calculator, one category further out.
  'that was fast',
  'that was quick',
  'that was easy',
  'wow that was fast',
  'impressive',
  'nice one',
  'well done',
  'good job',
  'you are quick',
  'that worked',
];

/**
 * Features: word unigrams and character trigrams.
 *
 * Trigrams carry the morphology a unigram misses — `tipping`, `tipped` and
 * `tip` share `tip`, and a misspelling degrades rather than vanishing. Both
 * families are lowercased and digits are collapsed to `0`, so `$47.50` and
 * `$120` are the same feature: the classifier decides WHO handles the request,
 * and the specific number is the specialist's business, not the router's.
 */
function features(text: string): string[] {
  const norm = String(text ?? '')
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, '0')
    .replace(/\s+/g, ' ')
    .trim();

  const out: string[] = [];
  for (const w of norm.split(/[^a-z0-9%$£€]+/).filter(Boolean)) out.push(`w:${w}`);

  const padded = ` ${norm} `;
  for (let i = 0; i + 3 <= padded.length; i++) out.push(`c:${padded.slice(i, i + 3)}`);
  return out;
}

export class IntentClassifier {
  private classes: TrainedClass[] = [];
  private vocabulary = new Set<string>();
  private totalDocs = 0;
  public trainingDigest = '';

  /**
   * Train from declarations. Deterministic: same examples in, same weights out,
   * regardless of insertion order — the digest sorts before hashing so a
   * registry that loads assistants in a different order does not produce a
   * different classifier.
   */
  train(
    declarations: Array<{ key: string; examples: string[] }>,
    extraNegatives: string[] = []
  ): void {
    const withNone = [
      ...declarations.filter((d) => d.examples?.length),
      { key: NONE_CLASS, examples: [...DEFAULT_NEGATIVES, ...extraNegatives] },
    ];

    const sorted = withNone
      .map((d) => ({ key: d.key, examples: [...d.examples].sort() }))
      .sort((a, b) => a.key.localeCompare(b.key));

    this.trainingDigest = createHash('sha256')
      .update(JSON.stringify(sorted))
      .digest('hex')
      .slice(0, 16);

    this.classes = [];
    this.vocabulary = new Set();
    this.totalDocs = 0;

    for (const d of sorted) {
      const counts = new Map<string, number>();
      let total = 0;
      for (const example of d.examples) {
        for (const f of features(example)) {
          counts.set(f, (counts.get(f) ?? 0) + 1);
          this.vocabulary.add(f);
          total++;
        }
      }
      this.classes.push({ key: d.key, counts, total, docs: d.examples.length });
      this.totalDocs += d.examples.length;
    }
  }

  get ready(): boolean {
    return this.classes.length >= 2;
  }

  /**
   * Argmax over log-probabilities, with add-one smoothing.
   *
   * Returns `undefined` rather than a low-confidence guess. A classifier that
   * always answers is a classifier that has stopped being evidence — the point
   * of the tier is to cover paraphrase, not to cover everything, and the
   * declination below it is a legitimate outcome.
   */
  classify(text: string, minConfidence = 0.75, minMargin = 0.3): ClassifierDecision | undefined {
    if (!this.ready) return undefined;
    const feats = features(text);
    if (feats.length === 0) return undefined;

    const V = this.vocabulary.size || 1;
    const scored = this.classes.map((c) => {
      let logp = Math.log(c.docs / this.totalDocs);
      for (const f of feats) {
        logp += Math.log(((c.counts.get(f) ?? 0) + 1) / (c.total + V));
      }
      return { key: c.key, logp };
    });

    scored.sort((a, b) => b.logp - a.logp);

    // Softmax over the log scores, shifted for numerical stability.
    const max = scored[0].logp;
    const exps = scored.map((s) => Math.exp(s.logp - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const confidence = exps[0] / sum;
    const margin = confidence - (exps[1] ?? 0) / sum;

    if (confidence < minConfidence || margin < minMargin) return undefined;

    // The out-of-domain class winning is a RESULT, not a failure to decide.
    // Returning undefined sends it to the declination, which is the correct
    // outcome and the one the pattern tier produced for free.
    if (scored[0].key === NONE_CLASS) return undefined;

    return {
      assistant: scored[0].key,
      confidence: Math.round(confidence * 1000) / 1000,
      margin: Math.round(margin * 1000) / 1000,
      runnerUp: scored[1]?.key,
      trainingDigest: this.trainingDigest,
      method: 'classifier',
    };
  }
}

/** One classifier, retrained whenever the registry changes. */
export const intentClassifier = new IntentClassifier();
