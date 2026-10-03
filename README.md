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
| `GET /api/keepalive` | pubblico | Richiamo giornaliero, tiene attivo il database |
| `GET /api/health` | pubblico | Controllo di vita |

La chiave va nell'header `X-API-Key` (o `Authorization: Bearer`).

## Variabili d'ambiente

- `DATABASE_URL`: stringa di connessione PostgreSQL.
- `LEADS_API_KEY`: chiave degli endpoint riservati, almeno 32 caratteri. Senza, rispondono 503.
- `DATABASE_SSL=disable`: solo per le prove in locale.

La tabella `mandates` viene creata al primo utilizzo, con la sicurezza a livello di riga attiva.

## Prova in locale

```bash
npm install
DATABASE_URL=postgres://... DATABASE_SSL=disable LEADS_API_KEY=$(openssl rand -hex 32) npx tsx scripts/dev-server.mts
```
