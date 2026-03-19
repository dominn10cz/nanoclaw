# News Digest — Spec pro implementaci

## Co chci

Pravidelný automatický digest novinek doručovaný přes Telegram. Dva nezávislé scheduled tasky:

1. **AI & Tech digest** — denně v 9:30 (po startu Macu, kdy už NanoClaw běží)
2. **Marketing & Analytics digest** — týdně v pondělí v 10:00

## Jak to má fungovat

NanoClaw scheduled task (cron) → kontejner fetchne RSS feedy → Claude zparsuje a sumarizuje → výsledek se pošle do mého Telegram chatu.

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

## Deduplikace (fáze 2)

Později přidat: JSON soubor v group folderu (`news-digest-seen.json`) s URL hashemi už poslaných článků. Agent ho přečte před generováním digestu a přeskočí duplicity.

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
   - AI digest: `30 9 * * *` (denně 9:30)
   - Marketing digest: `0 10 * * 1` (pondělí 10:00)
   - Poznámka: po migraci na Hetzner VPS přesunout na 7:00 / 8:00
2. Spuštění: `npx tsx scripts/seed-news-digests.ts` (nebo `--update` pro aktualizaci existujících promptů)
3. Task prompt obsahuje:
   - Seznam RSS URL k fetchnutí (curl)
   - Instrukce pro formát výstupu
   - Instrukce pro jazyk a filtrování
   - Instrukce pro uložení do souboru
4. Výstup tasku jde do Telegram chatu + ukládá se jako MD soubor
5. Kontejner má přístup k bash/curl — použij curl pro RSS (je to XML, nepotřebuješ browser)
