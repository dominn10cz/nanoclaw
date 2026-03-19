# News Digest — Spec pro implementaci

## Co chci

Pravidelný automatický digest novinek doručovaný přes Telegram. Dva nezávislé scheduled tasky:

1. **AI & Tech digest** — denně v 9:30 (po startu Macu, kdy už NanoClaw běží)
2. **Marketing & Analytics digest** — týdně v pondělí v 10:00

## Jak to má fungovat

NanoClaw scheduled task (cron) → kontejner fetchne RSS feedy → Claude zparsuje a sumarizuje → výsledek se pošle do mého Telegram chatu + emailem na domin.simunek@gmail.com a dominik.simunek@mytimi.cz (HTML formát přes Gmail MCP server).

Žádný externí nástroj (n8n, Ollama). Vše v rámci existující NanoClaw infrastruktury.

## RSS feedy

### AI & Tech (denní digest)
| Feed | URL | Popis |
|------|-----|-------|
| Hacker News (100+ bodů) | `https://hnrss.org/frontpage?points=100` | Filtrovaný HN, 5-8 článků/den |
| Anthropic Blog | `https://www.anthropic.com/rss.xml` | Claude novinky |
| OpenAI Blog | `https://openai.com/blog/rss.xml` | GPT/OpenAI novinky |
| The Verge | `https://www.theverge.com/rss/index.xml` | Tech editorial |
| Google AI Blog | `https://blog.google/technology/ai/rss/` | Gemini, výzkum |
| TechCrunch | `https://techcrunch.com/feed/` | Startupy, fundingy, AI novinky |

### Marketing & Analytics (týdenní digest)
| Feed | URL | Popis |
|------|-----|-------|
| Simo Ahava | `https://www.simoahava.com/index.xml` | GA4/GTM expert |
| Search Engine Land | `https://searchengineland.com/feed` | SEO + PPC |
| Google Ads Blog | `https://blog.google/products/ads/rss/` | Google Ads updaty |
| Google Marketing Platform | `https://blog.google/products/marketingplatform/rss/` | GA4 updaty |
| Moz Blog | `https://moz.com/blog/feed` | SEO best practices |

## Formát digestu

### AI & Tech (sekční formát)

```
📰 AI & Tech Digest — {datum}

🧠 **AI & LLM**

1. **Název článku** — 1-2 věty shrnutí
   🔗 odkaz

🤖 **AI Coding & Agents**

2. **Název článku** — 1-2 věty shrnutí
   🔗 odkaz

🦾 **Robotika & Hardware**

3. **Název článku** — 1-2 věty shrnutí
   🔗 odkaz

💻 **Tech & Dev**

4. **Název článku** — 1-2 věty shrnutí
   🔗 odkaz

💡 **Zajímavý trend:** volitelná 1 věta o tom co spojuje dnešní novinky
```

Sekce bez obsahu se vynechávají. Celkem 8-12 položek z RSS zdrojů.

### Marketing & Analytics

```
📊 Marketing & Analytics Digest — týden {číslo týdne}

**Top články tohoto týdne:**

1. **Název článku** — 1-2 věty shrnutí
   🔗 odkaz

...max 5-7 článků...
```

## Pravidla

- **Jazyk:** česky (i když zdroje jsou anglicky)
- **AI digest: 8-12 článků** ve 4 sekcích, **Marketing: 5-7 článků** — kvalita > kvantita
- **Seřadit podle relevance**, ne chronologicky
- **Přeskočit** PR/marketing články bez substance, duplicity, a články starší než 24h (denní) / 7 dní (týdenní)
- **Žádné paywall články** — pokud feed obsahuje jen teaser, zmínit ale označit jako paywall

## Auto-triage do Freelo Research Inbox ✅

Po vygenerování digestu agent vyhodnotí každý článek a ty, které projdou filtrem, vytvoří jako task ve Freelo tasklistu Research Inbox přes API. Účel: automaticky plnit research inbox tématy, která stojí za hlubší rešerši.

Implementace: sdílená `FREELO_TRIAGE_PROMPT` konstanta v `scripts/seed-news-digests.ts` appendnutá do obou digest promptů. Freelo env vars (`FREELO_API_KEY`, `FREELO_EMAIL`, `FREELO_PROJECT_ID`, `FREELO_TASKLIST_ID`) se injectují do kontejneru přes `src/container-runner.ts`. Agent volá Freelo API přes curl, JSON parsuje přes `grep -o` (kontejner nemá jq). Triage je graceful-degradation — pokud selže, digest se doručí stejně.

### Rozhodovací klíče

Agent ohodnotí každý článek podle těchto kritérií. Stačí splnit **1+ klíč** pro vytvoření tasku.

**🔴 Vždy vytvořit task (breaking/high-impact):**
- **Breaking change v platformě kterou denně používám** — GA4, GTM, Meta Ads API, Google Ads API, Consent Mode, BigQuery. Příklad: "GA4 ruší metriku X", "Meta mění Attribution API"
- **Deprecation nebo migrace** — cokoliv co má deadline a vyžaduje akci na klientských účtech
- **Bezpečnostní incident** relevantní pro stack (Supabase, Vercel, Next.js, npm supply chain)
- **AI agenti — nový produkt, protokol nebo zásadní update** — nový computer-use agent (Perplexity Computer, Manus, Devin...), nový agentic protocol (A2A, MCP rozšíření), OpenClaw release/update, Claude Agent SDK změna. Stavím vlastního agenta (NanoClaw) a potřebuji vědět co dělá konkurence a kam se trh posouvá.

**🟠 Vytvořit task pokud je akční (nový nástroj/přístup):**
- **Nový AI nástroj/framework přímo použitelný** v mém stacku — Claude API update, nový MCP server, Vercel AI SDK, relevantní npm balíček
- **AI agent use case nebo architektura** — zajímavý pattern jak někdo řeší agentní workflow, skill systém, tool use, memory, multi-agent orchestraci. Inspirace pro NanoClaw.
- **Nový přístup k automatizaci** který by šel nasadit v NanoClaw nebo pro klienty — nový skill koncept, workflow pattern, API integrace
- **Nástroj co nahrazuje drahý SaaS** — v duchu vibecoding filosofie (vlastní řešení místo placených služeb)

**🟡 Vytvořit task pokud je relevantní pro klienty:**
- **Změna v reklamních platformách** ovlivňující kampaně — nový formát reklam, změna biddingu, nová audience funkce (Meta, Google Ads)
- **SEO/SERP změna** s dopadem na klienty — algorithm update, nový SERP feature, AI Overviews expanze
- **E-commerce/conversion změna** — nový checkout flow, measurement protocol update, server-side tracking novinka

**⚪ Nevytvářet task (šum):**
- Obecné "AI is changing everything" opinion pieces bez konkrétní akce
- Startup funding/akvizice bez přímého dopadu na stack nebo klienty
- Tutoriály na základní věci které už ovládám (GA4 setup, základní GTM)
- Hardware novinky (telefony, čipy) bez vazby na vývoj nebo analytiku
- Akademický výzkum bez praktické aplikace v dohledné době

### Formát Freelo tasku

```
Název: {stručný název článku/tématu, max 100 znaků}
Popis (komentář):
  - 2-3 věty proč to stojí za rešerši
  - Odkaz na původní článek
  - Který klíč to matchnul (breaking change / nový nástroj / dopad na klienty)
```

### API volání

```bash
# Vytvoření tasku
curl -s -u "$FREELO_EMAIL:$FREELO_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"name": "Název tématu"}' \
  "https://api.freelo.io/v1/project/576829/tasklist/1801021/tasks"

# Přidání kontextu jako komentář
curl -s -u "$FREELO_EMAIL:$FREELO_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"content": "<p>Proč to stojí za rešerši...</p><p><a href=\"URL\">Zdroj</a></p>"}' \
  "https://api.freelo.io/v1/task/{task_id}/comments"
```

### Omezení
- **Max 3 tasky na digest** — aby inbox nezahlcoval, vybrat jen top 3 nejrelevantnější
- Freelo credentials: `FREELO_EMAIL`, `FREELO_API_KEY`, `FREELO_PROJECT_ID`, `FREELO_TASKLIST_ID` v `.env` — injectují se do kontejneru automaticky

---

## Deduplikace ✅

Implementováno přímo v digest promptech. Každý digest udržuje `seen-urls.json` soubor (AI: max 200 URL, marketing: max 100 URL) a přeskakuje už viděné články.

## Archivace

Každý digest se ukládá jako MD soubor do `~/Development/workspace/news-digests/`:

```
news-digests/
  ai-tech/
    2026-03-19.md
    2026-03-20.md
  marketing-analytics/
    2026-W12.md
    2026-W13.md
```

## Implementace

1. Seed script `scripts/seed-news-digests.ts` vloží dva scheduled tasky do SQLite (idempotentní):
   - AI digest: `0 9 * * *` (denně 9:00)
   - Marketing digest: `0 10 * * 1` (pondělí 10:00)
   - Poznámka: po migraci na Hetzner VPS přesunout na 7:00 / 8:00
2. Spuštění: `npx tsx scripts/seed-news-digests.ts` (nebo `--update` pro aktualizaci existujících promptů)
3. Task prompt obsahuje:
   - Seznam RSS URL k fetchnutí (curl)
   - Instrukce pro formát výstupu, jazyk a filtrování
   - Instrukce pro uložení do souboru a odeslání emailem (Gmail MCP)
   - Deduplikace přes `seen-urls.json`
   - Auto-triage do Freelo Research Inbox (sdílená `FREELO_TRIAGE_PROMPT` konstanta)
4. Výstup tasku jde do Telegram chatu + ukládá se jako MD soubor + email (HTML + plain text)
5. Kontejner má přístup k bash/curl — použij curl pro RSS (XML) i Freelo API
