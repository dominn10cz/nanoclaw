/**
 * Seed script for news digest scheduled tasks.
 * Idempotent — safe to run multiple times.
 *
 * Usage: npx tsx scripts/seed-news-digests.ts
 */

import { CronExpressionParser } from 'cron-parser';
import { initDatabase, createTask, getTaskById, updateTask } from '../src/db.js';
import { TIMEZONE } from '../src/config.js';

initDatabase();

const AI_TECH_PROMPT = `Jsi news curator. Tvým úkolem je připravit denní digest AI & tech novinek v češtině.

DŮLEŽITÉ: Tvůj textový výstup bude přímo odeslán uživateli do chatu. Nepoužívej send_message. Nebalíkuj výstup do <internal> tagů. Prostě vypiš hotový digest jako svou odpověď.

## Instrukce

1. Stáhni těchto 6 RSS feedů (XML):

   - Hacker News (100+ bodů): https://hnrss.org/frontpage?points=100
   - Anthropic Blog: https://www.anthropic.com/rss.xml
   - OpenAI Blog: https://openai.com/blog/rss.xml
   - The Verge: https://www.theverge.com/rss/index.xml
   - Google AI Blog: https://blog.google/technology/ai/rss/
   - TechCrunch: https://techcrunch.com/feed/

   Pro každý feed použij: curl -sL --max-time 15 "<url>"
   Pokud curl selže, zkus WebFetch jako fallback.

2. Zparsuj XML, extrahuj články (title, link, description/summary, pubDate).

3. Filtrování:
   - Zahrň pouze články publikované v posledních 24 hodinách.
   - Přeskoč PR/marketing fluff bez technické substance.
   - Deduplikuj — pokud víc zdrojů pokrývá stejné téma, vyber nejlepší zdroj.
   - Pokud článek vypadá jako paywall-only (jen teaser bez obsahu), označ ho [paywall].

4. Vyber 8–12 nejzajímavějších položek a rozděl je do 4 sekcí:
   - 🧠 **AI & LLM** — nové modely, výzkum, API změny, prompt engineering
   - 🤖 **AI Coding & Agents** — vibe coding, agentic coding, IDE s AI, autonomní agenti, coding assistants, MCP, Claude Code, Cursor, Copilot, Windsurf, Devin, Codex, agent frameworks
   - 🦾 **Robotika & Hardware** — roboti, čipy, embedded AI, fyzický svět
   - 💻 **Tech & Dev** — nástroje, frameworky, open source, developer novinky (které nespadají do AI Coding)

   Každá sekce by měla mít 2-4 položky. Pokud sekce nemá nic, vynech ji.

5. Výstup formátuj PŘESNĚ takto (vše česky, přeložené titulky i shrnutí):

📰 AI & Tech Digest — {dnešní datum, formát "19. března 2026"}

🧠 **AI & LLM**

1. **Přeložený název** — 1-2 věty shrnutí česky
   🔗 odkaz

🤖 **AI Coding & Agents**

2. **Přeložený název** — 1-2 věty shrnutí česky
   🔗 odkaz

🦾 **Robotika & Hardware**

3. **Přeložený název** — 1-2 věty shrnutí česky
   🔗 odkaz

💻 **Tech & Dev**

4. **Přeložený název** — 1-2 věty shrnutí česky
   🔗 odkaz

💡 **Zajímavý trend:** 1 věta o tom, co spojuje dnešní novinky (volitelné, jen pokud je to přirozené).

6. Ulož digest do souboru: \`/workspace/extra/workspace/news-digests/ai-tech/{YYYY-MM-DD}.md\` (vytvoř složky pokud neexistují). Datum v názvu souboru = dnešní datum.

7. Pokud žádný feed neobsahuje články za posledních 24h, pošli krátkou zprávu: "📰 Dnes žádné významné novinky v AI & tech." (soubor stejně vytvoř, s touto zprávou).`;

const MARKETING_PROMPT = `Jsi news curator. Tvým úkolem je připravit týdenní digest marketing & analytics novinek v češtině.

DŮLEŽITÉ: Tvůj textový výstup bude přímo odeslán uživateli do chatu. Nepoužívej send_message. Nebalíkuj výstup do <internal> tagů. Prostě vypiš hotový digest jako svou odpověď.

## Instrukce

1. Stáhni těchto 5 RSS feedů (XML):

   - Simo Ahava: https://www.simoahava.com/index.xml
   - Search Engine Land: https://searchengineland.com/feed
   - Google Ads Blog: https://blog.google/products/ads/rss/
   - Google Marketing Platform: https://blog.google/products/marketingplatform/rss/
   - Moz Blog: https://moz.com/blog/feed

   Pro každý feed použij: curl -sL --max-time 15 "<url>"
   Pokud curl selže, zkus WebFetch jako fallback.

2. Zparsuj XML, extrahuj články (title, link, description/summary, pubDate).

3. Filtrování:
   - Zahrň pouze články publikované v posledních 7 dnech.
   - Přeskoč PR/marketing fluff bez substance.
   - Deduplikuj — pokud víc feedů pokrývá stejné téma, vyber nejlepší zdroj.
   - Pokud článek vypadá jako paywall-only (jen teaser bez obsahu), označ ho [paywall].

4. Vyber 5–7 nejzajímavějších článků a seřaď je podle relevance (ne chronologicky).

5. Zjisti číslo aktuálního ISO týdne.

6. Výstup formátuj PŘESNĚ takto (vše česky, přeložené titulky i shrnutí):

📊 Marketing & Analytics Digest — týden {číslo týdne}

**Top články tohoto týdne:**

1. **Přeložený název článku** — 1-2 věty shrnutí česky
   🔗 odkaz

2. **Přeložený název článku** — 1-2 věty shrnutí česky
   🔗 odkaz

...pokračuj až do 5-7 článků...

💡 **Zajímavý trend:** 1 věta o tom, co spojuje novinky tohoto týdne (volitelné, jen pokud je to přirozené).

7. Ulož digest do souboru: \`/workspace/extra/workspace/news-digests/marketing-analytics/{YYYY}-W{WW}.md\` (vytvoř složky pokud neexistují). Číslo týdne = aktuální ISO týden.

8. Pokud žádný feed neobsahuje články za posledních 7 dní, pošli krátkou zprávu: "📊 Tento týden žádné významné novinky v marketingu & analytics." (soubor stejně vytvoř, s touto zprávou).`;

const tasks = [
  {
    id: 'news-digest-ai-tech',
    group_folder: 'telegram_main',
    chat_jid: 'tg:912403553',
    prompt: AI_TECH_PROMPT,
    schedule_type: 'cron' as const,
    schedule_value: '30 9 * * *',
    context_mode: 'isolated' as const,
    status: 'active' as const,
  },
  {
    id: 'news-digest-marketing',
    group_folder: 'telegram_main',
    chat_jid: 'tg:912403553',
    prompt: MARKETING_PROMPT,
    schedule_type: 'cron' as const,
    schedule_value: '0 10 * * 1',
    context_mode: 'isolated' as const,
    status: 'active' as const,
  },
];

const forceUpdate = process.argv.includes('--update');

for (const task of tasks) {
  const existing = getTaskById(task.id);
  if (existing && !forceUpdate) {
    console.log(`⏭  Task "${task.id}" already exists, skipping. Use --update to overwrite prompt.`);
    continue;
  }

  if (existing && forceUpdate) {
    updateTask(task.id, { prompt: task.prompt });
    console.log(`🔄 Updated prompt for task "${task.id}"`);
    continue;
  }

  const nextRun = CronExpressionParser.parse(task.schedule_value, {
    tz: TIMEZONE,
  })
    .next()
    .toISOString();

  createTask({
    ...task,
    next_run: nextRun,
    created_at: new Date().toISOString(),
  });

  console.log(`✅ Created task "${task.id}" — next run: ${nextRun}`);
}

console.log('\nDone.');
