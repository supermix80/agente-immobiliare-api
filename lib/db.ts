import postgres from "postgres";

// Connessione condivisa dalle funzioni. In produzione il database richiede SSL;
// DATABASE_SSL=disable serve solo per le prove in locale.
export const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});
