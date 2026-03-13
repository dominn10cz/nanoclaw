/**
 * Model selection for NanoClaw.
 * Reads per-group model preferences and classifies message complexity
 * to route messages to the appropriate Claude model tier.
 */
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from './config.js';
import { logger } from './logger.js';

export interface ModelPreferences {
  routine: string;
  moderate: string;
  complex: string;
}

const DEFAULT_PREFERENCES: ModelPreferences = {
  routine: 'claude-sonnet-4-6',
  moderate: 'claude-sonnet-4-6',
  complex: 'claude-opus-4-6',
};

export type ComplexityTier = 'routine' | 'moderate' | 'complex';

export interface SelectionContext {
  hasImages?: boolean;
  isScheduledTask?: boolean;
}

/**
 * Read model preferences for a group.
 * Returns defaults if no preferences file exists.
 */
export function readModelPreferences(groupFolder: string): ModelPreferences {
  const prefsPath = path.join(
    GROUPS_DIR,
    groupFolder,
    'model-preferences.json',
  );

  try {
    if (fs.existsSync(prefsPath)) {
      const data = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      return {
        routine: data.routine || DEFAULT_PREFERENCES.routine,
        moderate: data.moderate || DEFAULT_PREFERENCES.moderate,
        complex: data.complex || DEFAULT_PREFERENCES.complex,
      };
    }
  } catch (err) {
    logger.warn(
      { groupFolder, err },
      'Failed to read model preferences, using defaults',
    );
  }

  return { ...DEFAULT_PREFERENCES };
}

// Patterns that indicate simple/routine messages
const ROUTINE_PATTERNS = [
  /^(ok|ano|ne|jo|díky|dík|thanks|thx|ty|yes|no|sure|cool|nice|good|great|lol|haha|👍|👌|✅|❤️|🙏)\s*[.!?]*$/i,
  /^(ahoj|čau|hey|hi|hello|yo|hej)\s*[.!?]*$/i,
  /^(dobr[áéý]|dobře|jasně|rozumím|chápu|super|paráda|skvělé)\s*[.!?]*$/i,
];

// Keywords that indicate complex tasks
const COMPLEX_KEYWORDS = [
  /\b(analyz|analyzuj|porovnej|implement|debug|refactor|oprav|naplánuj|navrhni|vytvoř|napiš|přepiš)\b/i,
  /\b(analyze|compare|implement|debug|refactor|fix|plan|design|create|write|rewrite|build)\b/i,
  /\b(explain|vysvětli|prozkoum|research|investigate|review)\b/i,
  /```[\s\S]*```/, // code blocks
];

/**
 * Classify message complexity into a tier.
 */
export function classifyComplexity(
  prompt: string,
  context: SelectionContext = {},
): ComplexityTier {
  // Scheduled tasks are intentional work — always complex
  if (context.isScheduledTask) return 'complex';

  // Images require vision — complex
  if (context.hasImages) return 'complex';

  // Strip XML-formatted message metadata to get actual user text.
  // Format: <context .../><messages><message sender="..." time="...">text</message></messages>
  const textOnly = prompt
    .replace(/<context\b[^>]*\/>/g, '')
    .replace(/<\/?messages>/g, '')
    .replace(/<message\b[^>]*>/g, '')
    .replace(/<\/message>/g, '\n')
    .trim();

  // Short messages: check for routine patterns
  if (textOnly.length < 80) {
    const isRoutine = ROUTINE_PATTERNS.some((p) => p.test(textOnly));
    if (isRoutine) return 'routine';
  }

  // Long prompts are likely complex
  if (textOnly.length > 500) return 'complex';

  // Check for complex keywords
  const isComplex = COMPLEX_KEYWORDS.some((p) => p.test(textOnly));
  if (isComplex) return 'complex';

  return 'moderate';
}

const TIER_RANK: Record<ComplexityTier, number> = {
  routine: 0,
  moderate: 1,
  complex: 2,
};

/**
 * Returns true if `newTier` requires a more capable model than `currentTier`.
 */
export function needsUpgrade(
  currentTier: ComplexityTier,
  newTier: ComplexityTier,
): boolean {
  return TIER_RANK[newTier] > TIER_RANK[currentTier];
}

/**
 * Select the appropriate model for a message based on group preferences
 * and message complexity.
 */
export function selectModel(
  prompt: string,
  preferences: ModelPreferences,
  context: SelectionContext = {},
): string {
  const tier = classifyComplexity(prompt, context);
  const model = preferences[tier];

  logger.debug({ tier, model }, 'Model selected');

  return model;
}
