# Bee minigame — setup (5 minuti)

Copia questi file nella root del repo (stesse cartelle), poi `git add . && git commit && git push`.
Vercel riconosce da solo la cartella `api/` — niente PHP, niente server tuoi.

File toccati: index.html, style.css, mobile.css, script.js + nuovo api/score.js

## 1. Classifica pubblica (Upstash Redis, gratis)
Vercel → progetto → Storage / Marketplace → Upstash → Redis → Create → collega al progetto.
Vercel inietta da solo le variabili (KV_REST_API_URL + KV_REST_API_TOKEN, oppure UPSTASH_REDIS_REST_*; l'API legge entrambe).
Poi **redeploy**. Finché non lo fai il gioco funziona lo stesso, ma la top 10 resta spenta (nessun pannello).

## 2. Email a ogni punteggio (facoltativo)
Crea un account su resend.com, copia la API key, poi in Vercel → Settings → Environment Variables:
- RESEND_API_KEY = la key
- NOTIFY_EMAIL = la tua email (con l'account gratuito Resend deve essere quella con cui ti sei registrato)
Redeploy. Ti arriva "bee score: ABC 24" a ogni nome salvato.

## Regolazioni rapide
- durata partita: GAME_MS in script.js **e** in api/score.js (devono coincidere, 20000 = 20s)
- parole bloccate nei nomi: BLOCKED in api/score.js
- reset classifica: dalla console Upstash cancella la chiave `bee:lb`
