# agente-immobiliare-api

Backend della landing di Annamaria Cerbone e del CRM (app iOS/Mac e tool sul Mac). Funzioni Vercel + PostgreSQL.

## Endpoint

| Endpoint | Accesso | Uso |
|---|---|---|
| `POST /api/leads` | pubblico | Form della landing |
| `GET /api/leads` | chiave | Elenco dei lead per l'app |
| `GET /api/mandates` | chiave | Elenco degli incarichi, compresi i cancellati |
| `POST /api/mandates` | chiave | Crea un incarico |
| `PUT /api/mandates/{id}` | chiave | Aggiorna un incarico |
| `DELETE /api/mandates/{id}` | chiave | Cancellazione logica |
| `POST /api/assistant/draft` | chiave | Bozza della prossima risposta a un lead (non invia nulla) |
| `GET /api/keepalive` | pubblico | Richiamo giornaliero, tiene attivo il database |
| `GET /api/health` | pubblico | Controllo di vita |

La chiave va nell'header `X-API-Key` (o `Authorization: Bearer`).

## Variabili d'ambiente

- `DATABASE_URL`: stringa di connessione PostgreSQL.
- `LEADS_API_KEY`: chiave degli endpoint riservati, almeno 32 caratteri. Senza, rispondono 503.
- `DATABASE_SSL=disable`: solo per le prove in locale.

La tabella `mandates` viene creata al primo utilizzo, con la sicurezza a livello di riga attiva.

Ogni incarico può avere una `valuation` (oggetto JSON, al massimo 20.000 caratteri): la valutazione dell'immobile preparata nell'app. `PUT` la modifica solo se il campo è presente nella richiesta; `"valuation": null` la cancella.

## Prova in locale

```bash
npm install
DATABASE_URL=postgres://... DATABASE_SSL=disable LEADS_API_KEY=$(openssl rand -hex 32) npx tsx scripts/dev-server.mts
```


## Assistente: bozze delle risposte

`POST /api/assistant/draft` riceve la richiesta del lead e la conversazione finora e restituisce la bozza del prossimo messaggio, con un'azione (`continua`, `fissa_sopralluogo`, `fissa_telefonata`, `passa_ad_anna`, `chiudi`) e i dati raccolti. **Non invia messaggi**: la bozza torna all'app, Annamaria la legge e la manda lei.

```json
{"request": "Nome: Giulia. Voglio vendere. via Roma 12, Rozzano", "messages": [{"from": "agente", "text": "..."}, {"from": "cliente", "text": "..."}]}
```

- Modello `claude-opus-5-5`, effort `low`, risposta validata da uno schema; se il modello rifiuta, l'API riprova da sola su un modello di riserva (`fallbacks: "default"`).
- Serve la variabile `ANTHROPIC_API_KEY` su Vercel; senza, l'endpoint risponde 503 e l'app lo dice.
- Le regole (`lib/assistant-rules.ts`) sono una copia di `Agente immobiliare /Simulatore/regole_assistente.txt` nel monorepo, provate con il simulatore. Vanno tenute uguali.
- I testi dei lead passano dal fornitore del modello: l'informativa privacy del sito va aggiornata prima dell'uso reale.
- Test senza modello: `npx tsx --test tests/assistant.test.mts`.
