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

const FREELO_TRIAGE_PROMPT = `

## Auto-triage do Freelo Research Inbox

Po vygenerování digestu vyhodnoť každý článek podle rozhodovacích klíčů níže. Vyber **max 3 nejrelevantnější** a vytvoř je jako tasky ve Freelo.

### Rozhodovací klíče

Stačí splnit **1+ klíč** pro vytvoření tasku:

**🔴 Vždy vytvořit (breaking/high-impact):**
- Breaking change v platformě: GA4, GTM, Meta Ads API, Google Ads API, Consent Mode, BigQuery
- Deprecation/migrace s deadlinem vyžadující akci
- Bezpečnostní incident v stacku (Supabase, Vercel, Next.js, npm)
- AI agenti — nový produkt, protokol, zásadní update (computer-use agent, MCP rozšíření, Claude Agent SDK)

**🟠 Vytvořit pokud akční (nový nástroj/přístup):**
- Nový AI nástroj/framework pro můj stack — Claude API, MCP server, Vercel AI SDK
- AI agent use case/architektura — workflow pattern, skill systém, multi-agent orchestrace
- Nový přístup k automatizaci nasaditelný v NanoClaw nebo pro klienty
- Nástroj nahrazující drahý SaaS (vibecoding filosofie)

**🟡 Vytvořit pokud relevantní pro klienty:**
- Změna v reklamních platformách — nový formát, bidding, audience (Meta, Google Ads)
- SEO/SERP změna — algorithm update, AI Overviews
- E-commerce/conversion — measurement protocol, server-side tracking

**⚪ Nevytvářet (šum):**
- Opinion pieces bez konkrétní akce
- Funding/akvizice bez dopadu na stack
- Základní tutoriály
- Hardware bez vazby na vývoj
- Akademický výzkum bez praktické aplikace

### Postup

1. Projdi všechny články z digestu a ohodnoť je podle klíčů výše.
2. Vyber max 3 nejrelevantnější (preferuj 🔴 > 🟠 > 🟡).
3. Pro každý vybraný článek:

   a) Vytvoř task:
   \`\`\`bash
   TASK_RESPONSE=$(curl -s -u "$FREELO_EMAIL:$FREELO_API_KEY" \\
     -X POST -H "Content-Type: application/json" \\
     -d '{"name": "NÁZEV (max 100 znaků, česky)"}' \\
     "https://api.freelo.io/v1/project/$FREELO_PROJECT_ID/tasklist/$FREELO_TASKLIST_ID/tasks")
   TASK_ID=$(echo "$TASK_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
   \`\`\`

   b) Přidej komentář s kontextem:
   \`\`\`bash
   curl -s -u "$FREELO_EMAIL:$FREELO_API_KEY" \\
     -X POST -H "Content-Type: application/json" \\
     -d '{"content": "<p>2-3 věty proč to stojí za rešerši.</p><p><a href=\\"URL\\">Zdroj</a></p><p>Klíč: 🔴/🟠/🟡 popis</p>"}' \\
     "https://api.freelo.io/v1/task/$TASK_ID/comments"
   \`\`\`

4. **Error handling:** Pokud curl selže (chybí credentials, API error), pokračuj dál — digest MUSÍ být doručen vždy. Triage je bonus.
5. Pokud žádný článek nesplňuje klíče, nevytvářej žádný task.

### Souhrn do Telegram zprávy

Na konec Telegram zprávy (za digest) přidej řádek:
- Pokud byly vytvořeny tasky: \`📋 Research inbox: X nových tasků ve Freelo\`
- Pokud nebyly: nic nepřidávej`;

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

4. Deduplikace proti předchozím digestům:
   - Načti soubor \`/workspace/extra/workspace/news-digests/ai-tech/seen-urls.json\` (pokud existuje; pokud ne, považuj za prázdný seznam).
   - Soubor obsahuje JSON pole URL stringů (nejstarší první).
   - Přeskoč všechny články, jejichž URL je již v tomto seznamu.
   - PO vygenerování digestu přidej všechny nové URL článků zahrnutých v digestu na konec pole.
   - Pokud pole přesáhne 200 položek, odstraň nejstarší záznamy ze začátku, aby zůstalo max 200.
   - Ulož aktualizovaný seznam zpět do stejného souboru (vytvoř složky pokud neexistují).

5. Vyber 8–12 nejzajímavějších položek a rozděl je do 4 sekcí:
   - 🧠 **AI & LLM** — nové modely, výzkum, API změny, prompt engineering
   - 🤖 **AI Coding & Agents** — vibe coding, agentic coding, IDE s AI, autonomní agenti, coding assistants, MCP, Claude Code, Cursor, Copilot, Windsurf, Devin, Codex, agent frameworks
   - 🦾 **Robotika & Hardware** — roboti, čipy, embedded AI, fyzický svět
   - 💻 **Tech & Dev** — nástroje, frameworky, open source, developer novinky (které nespadají do AI Coding)

   Každá sekce by měla mít 2-4 položky. Pokud sekce nemá nic, vynech ji.

6. Výstup formátuj PŘESNĚ takto (vše česky, přeložené titulky i shrnutí):

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

7. Ulož digest do souboru: \`/workspace/extra/workspace/news-digests/ai-tech/{YYYY-MM-DD}.md\` (vytvoř složky pokud neexistují). Datum v názvu souboru = dnešní datum.

8. POVINNÉ — Pošli digest emailem pomocí mcp__gmail__send_email toolu (MUSÍŠ tento tool zavolat, nepiš kód, zavolej přímo MCP tool).
   - Příjemci (to): domin.simunek@gmail.com, dominik.simunek@mytimi.cz
   - Předmět (subject): 📰 AI & Tech Digest — {dnešní datum}
   - Tělo (body): Plain-text verze digestu (bez HTML tagů, čistý text se zachovaným formátováním)
   - HTML tělo (htmlBody): HTML verze digestu

   HTML email formátuj takto:
   - Každá sekce (🧠 AI & LLM, 🤖 AI Coding & Agents, atd.) jako <h2> s emoji
   - Každý článek jako <h3> s odkazem (<a href="...">) přímo v názvu
   - Shrnutí jako <p> pod názvem
   - Trend na konci jako <blockquote>
   - Minimální inline CSS: font-family: -apple-system, sans-serif; max-width: 600px; line-height: 1.6
   - Odkazy modré, podtržené — standardní email styl

   DŮLEŽITÉ: Musíš poslat OBA parametry — body (plain text fallback pro klienty bez HTML) i htmlBody (bohatý HTML formát).

9. AŽ PO odeslání emailu a uložení souboru proveď auto-triage do Freelo Research Inbox (viz sekce níže). Triage je bonus — pokud selže, pokračuj.

10. Vypiš digest jako svou textovou odpověď (ta se pošle do Telegramu). Pokud triage vytvořil tasky, přidej na konec řádek se souhrnem.

11. Pokud žádný feed neobsahuje články za posledních 24h, pošli krátkou zprávu: "📰 Dnes žádné významné novinky v AI & tech." (soubor stejně vytvoř, s touto zprávou, email neposílej, triage nedělej).
${FREELO_TRIAGE_PROMPT}`;

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

4. Deduplikace proti předchozím digestům:
   - Načti soubor \`/workspace/extra/workspace/news-digests/marketing-analytics/seen-urls.json\` (pokud existuje; pokud ne, považuj za prázdný seznam).
   - Soubor obsahuje JSON pole URL stringů (nejstarší první).
   - Přeskoč všechny články, jejichž URL je již v tomto seznamu.
   - PO vygenerování digestu přidej všechny nové URL článků zahrnutých v digestu na konec pole.
   - Pokud pole přesáhne 100 položek, odstraň nejstarší záznamy ze začátku, aby zůstalo max 100.
   - Ulož aktualizovaný seznam zpět do stejného souboru (vytvoř složky pokud neexistují).

5. Vyber 5–7 nejzajímavějších článků a seřaď je podle relevance (ne chronologicky).

6. Zjisti číslo aktuálního ISO týdne.

7. Výstup formátuj PŘESNĚ takto (vše česky, přeložené titulky i shrnutí):

📊 Marketing & Analytics Digest — týden {číslo týdne}

**Top články tohoto týdne:**

1. **Přeložený název článku** — 1-2 věty shrnutí česky
   🔗 odkaz

2. **Přeložený název článku** — 1-2 věty shrnutí česky
   🔗 odkaz

...pokračuj až do 5-7 článků...

💡 **Zajímavý trend:** 1 věta o tom, co spojuje novinky tohoto týdne (volitelné, jen pokud je to přirozené).

8. Ulož digest do souboru: \`/workspace/extra/workspace/news-digests/marketing-analytics/{YYYY}-W{WW}.md\` (vytvoř složky pokud neexistují). Číslo týdne = aktuální ISO týden.

9. POVINNÉ — Pošli digest emailem pomocí mcp__gmail__send_email toolu (MUSÍŠ tento tool zavolat, nepiš kód, zavolej přímo MCP tool).
   - Příjemci (to): domin.simunek@gmail.com, dominik.simunek@mytimi.cz
   - Předmět (subject): 📊 Marketing & Analytics Digest — týden {číslo týdne}
   - Tělo (body): Plain-text verze digestu (bez HTML tagů, čistý text se zachovaným formátováním)
   - HTML tělo (htmlBody): HTML verze digestu

   HTML email formátuj takto:
   - Nadpis digestu jako <h1>
   - Každý článek jako <h3> s odkazem (<a href="...">) přímo v názvu
   - Shrnutí jako <p> pod názvem
   - Trend na konci jako <blockquote>
   - Minimální inline CSS: font-family: -apple-system, sans-serif; max-width: 600px; line-height: 1.6
   - Odkazy modré, podtržené — standardní email styl

   DŮLEŽITÉ: Musíš poslat OBA parametry — body (plain text fallback pro klienty bez HTML) i htmlBody (bohatý HTML formát).

10. AŽ PO odeslání emailu a uložení souboru proveď auto-triage do Freelo Research Inbox (viz sekce níže). Triage je bonus — pokud selže, pokračuj.

11. Vypiš digest jako svou textovou odpověď (ta se pošle do Telegramu). Pokud triage vytvořil tasky, přidej na konec řádek se souhrnem.

12. Pokud žádný feed neobsahuje články za posledních 7 dní, pošli krátkou zprávu: "📊 Tento týden žádné významné novinky v marketingu & analytics." (soubor stejně vytvoř, s touto zprávou, email neposílej, triage nedělej).
${FREELO_TRIAGE_PROMPT}`;

const tasks = [
  {
    id: 'news-digest-ai-tech',
    group_folder: 'telegram_main',
    chat_jid: 'tg:912403553',
    prompt: AI_TECH_PROMPT,
    schedule_type: 'cron' as const,
    schedule_value: '0 9 * * *',
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
    const nextRun = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    })
      .next()
      .toISOString();
    updateTask(task.id, {
      prompt: task.prompt,
      schedule_value: task.schedule_value,
      next_run: nextRun,
    });
    console.log(`🔄 Updated task "${task.id}" (prompt, schedule, next_run: ${nextRun})`);
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
