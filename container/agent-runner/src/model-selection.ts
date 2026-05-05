/**
 * Per-group model selection.
 *
 * Reads model-preferences.json from the mounted group folder
 * (/workspace/agent/model-preferences.json) and classifies each inbound
 * message batch into a complexity tier (routine / moderate / complex) so
 * the provider can route to the appropriate Claude model.
 *
 * Ported from v1 src/model-selection.ts (regex patterns kept verbatim).
 * v1's needsUpgrade()/tier-cache logic is intentionally dropped — v2
 * picks a model per provider.query() call, so escalation falls out of
 * the next message's classification automatically.
 */
import fs from 'fs';
import path from 'path';

function log(msg: string): void {
  console.error(`[model-selection] ${msg}`);
}

export type ComplexityTier = 'routine' | 'moderate' | 'complex';

export interface ModelPreferences {
  routine: string;
  moderate: string;
  complex: string;
}

export interface SelectionContext {
  hasImages?: boolean;
  isScheduledTask?: boolean;
}

const DEFAULT_PREFERENCES: ModelPreferences = {
  routine: 'claude-sonnet-4-6',
  moderate: 'claude-sonnet-4-6',
  complex: 'claude-opus-4-7',
};

const PREFERENCES_FILENAME = 'model-preferences.json';

/**
 * Read model preferences from <workspacePath>/model-preferences.json.
 * Returns defaults (with a logged warning) on missing/invalid file.
 * Missing keys in a partial file fall back to the matching default.
 */
export function readModelPreferences(workspacePath: string): ModelPreferences {
  const prefsPath = path.join(workspacePath, PREFERENCES_FILENAME);

  if (!fs.existsSync(prefsPath)) {
    log(`using defaults (${prefsPath} not found)`);
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const data = JSON.parse(fs.readFileSync(prefsPath, 'utf-8')) as Partial<ModelPreferences>;
    return {
      routine: data.routine || DEFAULT_PREFERENCES.routine,
      moderate: data.moderate || DEFAULT_PREFERENCES.moderate,
      complex: data.complex || DEFAULT_PREFERENCES.complex,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`failed to parse ${prefsPath}: ${errMsg} — using defaults`);
    return { ...DEFAULT_PREFERENCES };
  }
}

const ROUTINE_PATTERNS = [
  /^(ok|ano|ne|jo|díky|dík|thanks|thx|ty|yes|no|sure|cool|nice|good|great|lol|haha|👍|👌|✅|❤️|🙏)\s*[.!?]*$/i,
  /^(ahoj|čau|hey|hi|hello|yo|hej)\s*[.!?]*$/i,
  /^(dobr[áéý]|dobře|jasně|rozumím|chápu|super|paráda|skvělé)\s*[.!?]*$/i,
];

const COMPLEX_KEYWORDS = [
  /\b(analyz|analyzuj|porovnej|implement|debug|refactor|oprav|naplánuj|navrhni|vytvoř|napiš|přepiš)\b/i,
  /\b(analyze|compare|implement|debug|refactor|fix|plan|design|create|write|rewrite|build)\b/i,
  /\b(explain|vysvětli|prozkoum|research|investigate|review)\b/i,
  /```[\s\S]*```/,
];

/**
 * Classify message complexity into a tier.
 *
 * Order of precedence:
 *   1. Scheduled task → complex
 *   2. Has images → complex
 *   3. Strip XML metadata wrapping (`<context …/>`, `<messages>`, `<message …>`)
 *   4. < 80 chars + matches a routine pattern → routine
 *   5. > 500 chars → complex
 *   6. Matches a complex keyword (or contains a fenced code block) → complex
 *   7. default → moderate
 */
export function classifyComplexity(
  prompt: string,
  context: SelectionContext = {},
): ComplexityTier {
  if (context.isScheduledTask) return 'complex';
  if (context.hasImages) return 'complex';

  const textOnly = prompt
    .replace(/<context\b[^>]*\/>/g, '')
    .replace(/<\/?messages>/g, '')
    .replace(/<message\b[^>]*>/g, '')
    .replace(/<\/message>/g, '\n')
    .trim();

  if (textOnly.length < 80) {
    if (ROUTINE_PATTERNS.some((p) => p.test(textOnly))) return 'routine';
  }

  if (textOnly.length > 500) return 'complex';

  if (COMPLEX_KEYWORDS.some((p) => p.test(textOnly))) return 'complex';

  return 'moderate';
}

/**
 * Select the model for a prompt given the group's preferences and
 * any context overrides. Logs the decision so deployments can verify
 * classification in nanoclaw.log.
 */
export function selectModel(
  prompt: string,
  preferences: ModelPreferences,
  context: SelectionContext = {},
): { tier: ComplexityTier; model: string } {
  const tier = classifyComplexity(prompt, context);
  const model = preferences[tier];
  log(`tier=${tier} model=${model}`);
  return { tier, model };
}

const TIER_RANK: Record<ComplexityTier, number> = {
  routine: 0,
  moderate: 1,
  complex: 2,
};

/**
 * True when `next` requires a stronger model than `current`. Used by the
 * poll-loop's follow-up poller: a long-running query already committed
 * to one model at sdkQuery() time, so when an inbound follow-up escalates
 * complexity the only way to upgrade is to end the query and let the
 * outer loop spawn a fresh one with the new model.
 *
 * Downgrades return false on purpose — running a routine reply on opus
 * costs more tokens, but ending+restarting the query loses the warm
 * SDK process and prompt cache. v1 made the same trade-off.
 */
export function needsUpgrade(current: ComplexityTier, next: ComplexityTier): boolean {
  return TIER_RANK[next] > TIER_RANK[current];
}
