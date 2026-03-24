# Migrace NanoClaw na Hetzner VPS

Krok za krokem jak přesunout NanoClaw z lokálního MacBooku na Hetzner VPS s 24/7 provozem.

## Předpoklady

- Hetzner VPS s Ubuntu/Debian (min. 5 GB disk, 2 GB RAM)
- SSH přístup na server
- GitHub repo s NanoClaw (`git@github.com:dominn10cz/nanoclaw.git`)
- Docker nainstalovaný na serveru
- Kanály: Telegram (WhatsApp se nepoužívá)

## Krok 1: Příprava serveru

```bash
# Připojit se na Hetzner
ssh user@tvuj-hetzner-ip

# Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# Build dependencies pro native moduly (better-sqlite3, sharp)
sudo apt install -y build-essential python3 libvips-dev

# Docker (pokud ještě nemáš)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Ověřit
node -v    # >= 20
docker -v  # >= 24
```

## Krok 2: Naklonovat repo a nainstalovat

```bash
cd ~
git clone git@github.com:dominn10cz/nanoclaw.git
cd nanoclaw
npm install
npm run build
```

## Krok 3: Přenést data z MacBooku

Na MacBooku spustit:

```bash
cd ~/Development/nanoclaw

# Zabalit potřebné soubory
tar czf nanoclaw-data.tar.gz \
  .env \
  store/messages.db \
  groups/ \
  data/sessions/ \
  data/env/

# Přenést na Hetzner
scp nanoclaw-data.tar.gz user@tvuj-hetzner-ip:~/nanoclaw/
```

Na Hetzneru rozbalit:

```bash
cd ~/nanoclaw
tar xzf nanoclaw-data.tar.gz
rm nanoclaw-data.tar.gz
```

### Co se přenáší

| Soubor/složka | Účel |
|---------------|------|
| `.env` | API tokeny (Telegram, OpenAI/Anthropic, Freelo) |
| `store/messages.db` | SQLite databáze (zprávy, sessions, scheduled tasks) |
| `groups/` | Per-group paměť a CLAUDE.md soubory |
| `data/sessions/` | Claude session stav |
| `data/env/` | Uložené env proměnné |

### Co se nepřenáší

| Soubor/složka | Důvod |
|---------------|-------|
| `store/auth/` | WhatsApp auth — nepoužívá se |
| `data/x-browser-profile/` | Chrome profil — přegeneruje se |
| `node_modules/` | Přeinstaluje se na serveru |
| `dist/` | Překompiluje se na serveru |

## Krok 4: Vytvořit mount allowlist

```bash
mkdir -p ~/.config/nanoclaw
echo '{}' > ~/.config/nanoclaw/mount-allowlist.json
echo '{"default": {"allowed": true}}' > ~/.config/nanoclaw/sender-allowlist.json
```

Pokud máš vlastní sender-allowlist na MacBooku, přenes ji:

```bash
# Na MacBooku
scp ~/.config/nanoclaw/sender-allowlist.json user@tvuj-hetzner-ip:~/.config/nanoclaw/
```

## Krok 5: Sestavit agent kontejner

```bash
cd ~/nanoclaw
./container/build.sh
```

Trvá 2–5 minut (stahuje Chromium a Node.js závislosti). Výsledek: Docker image `nanoclaw-agent:latest`.

## Krok 6: Otestovat ručně

```bash
cd ~/nanoclaw
npm run dev
```

- Pošli zprávu přes Telegram → měl by odpovědět
- `Ctrl+C` pro zastavení

## Krok 7: Nastavit systemd službu

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/nanoclaw.service << 'EOF'
[Unit]
Description=NanoClaw AI Assistant
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/nanoclaw
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:%h/nanoclaw/logs/nanoclaw.log
StandardError=append:%h/nanoclaw/logs/nanoclaw.error.log
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

# Vytvořit logs složku
mkdir -p ~/nanoclaw/logs

# Povolit lingering (služba běží i po odhlášení z SSH)
sudo loginctl enable-linger $USER

# Načíst a spustit
systemctl --user daemon-reload
systemctl --user enable nanoclaw
systemctl --user start nanoclaw
```

### Správa služby

```bash
systemctl --user status nanoclaw     # stav
systemctl --user restart nanoclaw    # restart
systemctl --user stop nanoclaw       # zastavit
journalctl --user -u nanoclaw -f     # živé logy
tail -f ~/nanoclaw/logs/nanoclaw.log # log soubor
```

## Krok 8: Auto-deploy z GitHubu (volitelné)

Aby se po push na `main` automaticky pullnul a restartoval NanoClaw na serveru.

### Varianta A: GitHub Actions + SSH

Přidat do `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Hetzner
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd ~/nanoclaw
            git pull
            npm install --production
            npm run build
            systemctl --user restart nanoclaw
```

Vyžaduje nastavit GitHub Secrets:
- `HETZNER_HOST` — IP adresa serveru
- `HETZNER_USER` — SSH uživatel
- `HETZNER_SSH_KEY` — privátní SSH klíč

### Varianta B: Ruční deploy

```bash
ssh user@tvuj-hetzner-ip "cd ~/nanoclaw && git pull && npm install && npm run build && systemctl --user restart nanoclaw"
```

## Workflow po migraci

### Vývoj (na MacBooku)

```
Editovat kód v Claude Code → git push → deploy na Hetzner
```

### Provoz (na Hetzneru)

NanoClaw běží 24/7. Správa přes SSH:

```bash
ssh user@tvuj-hetzner-ip
systemctl --user status nanoclaw   # kontrola
tail -100 ~/nanoclaw/logs/nanoclaw.log  # poslední logy
```

### Aktualizace z upstreamu

Na MacBooku jako dosud:

```bash
# V Claude Code
/update-nanoclaw

# Pak deploy
git push
# → auto-deploy (pokud nastavený) nebo ruční SSH příkaz
```

## Rollback

Pokud něco nefunguje na Hetzneru:

```bash
ssh user@tvuj-hetzner-ip
cd ~/nanoclaw
git log --oneline -5           # najít předchozí commit
git reset --hard <commit>      # vrátit
npm run build
systemctl --user restart nanoclaw
```

## Checklist

- [ ] Node.js 22+ nainstalovaný na Hetzneru
- [ ] Docker nainstalovaný, user v docker skupině
- [ ] Repo naklonované
- [ ] `.env` přenesený
- [ ] `store/messages.db` přenesený
- [ ] `groups/` přenesené
- [ ] `~/.config/nanoclaw/` vytvořený
- [ ] Agent kontejner sestaven (`./container/build.sh`)
- [ ] Ruční test (`npm run dev`) úspěšný
- [ ] systemd služba nastavená a běží
- [ ] `loginctl enable-linger` povolený
- [ ] Telegram bot odpovídá ze serveru
- [ ] Zastavit launchd službu na MacBooku (`launchctl unload`)
- [ ] (Volitelné) Auto-deploy z GitHubu nastavený
