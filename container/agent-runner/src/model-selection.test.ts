import { describe, it, expect } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { classifyComplexity, needsUpgrade, readModelPreferences, selectModel } from './model-selection.js';

describe('classifyComplexity', () => {
  describe('context overrides', () => {
    it('scheduled task always returns complex', () => {
      expect(classifyComplexity('ok', { isScheduledTask: true })).toBe('complex');
    });

    it('hasImages always returns complex', () => {
      expect(classifyComplexity('díky', { hasImages: true })).toBe('complex');
    });

    it('scheduled task wins over routine pattern', () => {
      expect(classifyComplexity('ok', { isScheduledTask: true })).toBe('complex');
    });
  });

  describe('routine path', () => {
    it.each([
      ['ok'],
      ['ok.'],
      ['díky'],
      ['Díky!'],
      ['thanks'],
      ['thx'],
      ['yes'],
      ['👍'],
      ['ahoj'],
      ['čau'],
      ['hey'],
      ['jasně'],
      ['rozumím'],
      ['super'],
      ['paráda'],
    ])('classifies "%s" as routine', (text) => {
      expect(classifyComplexity(text)).toBe('routine');
    });

    it('routine pattern over 80 chars falls through to moderate', () => {
      const text = 'díky ' + 'x'.repeat(85);
      expect(classifyComplexity(text)).toBe('moderate');
    });
  });

  describe('complex path', () => {
    it('over 500 chars is complex', () => {
      const text = 'a'.repeat(501);
      expect(classifyComplexity(text)).toBe('complex');
    });

    it.each([
      ['analyzuj logy'],
      ['Refactor this code please'],
      ['Implement OAuth flow'],
      ['debug this'],
      ['oprav prosím chybu'],
      ['vysvětli mi tu architekturu'],
      ['research how this works'],
    ])('classifies "%s" as complex via keyword', (text) => {
      expect(classifyComplexity(text)).toBe('complex');
    });

    it('detects fenced code blocks as complex', () => {
      const text = 'koukni se:\n```js\nconst x = 1;\n```';
      expect(classifyComplexity(text)).toBe('complex');
    });
  });

  describe('moderate (default) path', () => {
    it('mid-length neutral text is moderate', () => {
      const text = 'Můžeš mi říct, kolik máme klientů aktivních tento měsíc a jak se to změnilo oproti minulému?';
      expect(classifyComplexity(text)).toBe('moderate');
    });

    it('non-routine short text is moderate', () => {
      expect(classifyComplexity('Kolik je hodin v Tokyu?')).toBe('moderate');
    });
  });

  describe('XML metadata stripping', () => {
    it('strips context+messages wrapper before classifying routine', () => {
      const prompt =
        '<context timezone="Europe/Prague" />\n<messages>\n<message id="1" sender="Dominik" time="12:00">ok</message>\n</messages>';
      expect(classifyComplexity(prompt)).toBe('routine');
    });

    it('strips wrapper around complex keyword', () => {
      const prompt =
        '<context timezone="Europe/Prague" />\n<message id="1" sender="X" time="12:00">analyzuj data</message>';
      expect(classifyComplexity(prompt)).toBe('complex');
    });
  });
});

describe('readModelPreferences', () => {
  it('returns defaults when file is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-prefs-missing-'));
    try {
      const prefs = readModelPreferences(dir);
      expect(prefs.routine).toBe('claude-sonnet-4-6');
      expect(prefs.moderate).toBe('claude-sonnet-4-6');
      expect(prefs.complex).toBe('claude-opus-4-7');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads valid JSON and merges with defaults', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-prefs-valid-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'model-preferences.json'),
        JSON.stringify({
          routine: 'claude-haiku-4-5-20251001',
          complex: 'claude-opus-4-7',
        }),
      );
      const prefs = readModelPreferences(dir);
      expect(prefs.routine).toBe('claude-haiku-4-5-20251001');
      expect(prefs.moderate).toBe('claude-sonnet-4-6'); // default fallback
      expect(prefs.complex).toBe('claude-opus-4-7');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns defaults on malformed JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-prefs-bad-'));
    try {
      fs.writeFileSync(path.join(dir, 'model-preferences.json'), '{ not valid json');
      const prefs = readModelPreferences(dir);
      expect(prefs.routine).toBe('claude-sonnet-4-6');
      expect(prefs.complex).toBe('claude-opus-4-7');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('selectModel', () => {
  const prefs = {
    routine: 'claude-sonnet-4-6',
    moderate: 'claude-sonnet-4-6',
    complex: 'claude-opus-4-7',
  };

  it('routes routine to preferences.routine', () => {
    const { tier, model } = selectModel('ok', prefs);
    expect(tier).toBe('routine');
    expect(model).toBe('claude-sonnet-4-6');
  });

  it('routes complex (via length) to preferences.complex', () => {
    const { tier, model } = selectModel('a'.repeat(600), prefs);
    expect(tier).toBe('complex');
    expect(model).toBe('claude-opus-4-7');
  });

  it('routes scheduled task to preferences.complex', () => {
    const { tier, model } = selectModel('ok', prefs, { isScheduledTask: true });
    expect(tier).toBe('complex');
    expect(model).toBe('claude-opus-4-7');
  });

  it('routes images to preferences.complex', () => {
    const { tier, model } = selectModel('díky', prefs, { hasImages: true });
    expect(tier).toBe('complex');
    expect(model).toBe('claude-opus-4-7');
  });
});

describe('needsUpgrade', () => {
  it('routine → moderate is an upgrade', () => {
    expect(needsUpgrade('routine', 'moderate')).toBe(true);
  });

  it('routine → complex is an upgrade', () => {
    expect(needsUpgrade('routine', 'complex')).toBe(true);
  });

  it('moderate → complex is an upgrade', () => {
    expect(needsUpgrade('moderate', 'complex')).toBe(true);
  });

  it('same tier is not an upgrade', () => {
    expect(needsUpgrade('routine', 'routine')).toBe(false);
    expect(needsUpgrade('moderate', 'moderate')).toBe(false);
    expect(needsUpgrade('complex', 'complex')).toBe(false);
  });

  it('downgrades are not upgrades', () => {
    expect(needsUpgrade('complex', 'moderate')).toBe(false);
    expect(needsUpgrade('complex', 'routine')).toBe(false);
    expect(needsUpgrade('moderate', 'routine')).toBe(false);
  });
});
