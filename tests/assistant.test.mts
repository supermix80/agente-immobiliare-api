// Test dell'assistente senza chiamare il modello: richiesta, disponibilità, testo passato al modello.
// Uso: npx tsx --test tests/assistant.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftSchema, ValidationError, availability, buildPrompt, parseDraftRequest, todayInRome } from "../lib/assistant.ts";
import { ASSISTANT_RULES } from "../lib/assistant-rules.ts";

test("richiesta valida", () => {
  const r = parseDraftRequest({ request: " Nome: Giulia. Voglio vendere. ", messages: [{ from: "cliente", text: " Ciao " }] });
  assert.equal(r.request, "Nome: Giulia. Voglio vendere.");
  assert.deepEqual(r.messages, [{ from: "cliente", text: "Ciao" }]);
});

test("richieste non valide", () => {
  for (const body of [null, {}, { request: "" }, { request: "x", messages: [{ from: "bot", text: "a" }] },
    { request: "x", messages: [{ from: "cliente", text: " " }] }, { request: "x".repeat(3001) },
    { request: "x", messages: Array(41).fill({ from: "cliente", text: "a" }) },
    { request: "x", messages: null }, { request: "x", messages: "ciao" }, { request: "x", messages: {} }]) {
    assert.throws(() => parseDraftRequest(body), ValidationError);
  }
});

test("oggi si calcola sull'ora di Roma", () => {
  // 23:30 UTC del 3 ottobre = 01:30 del 4 ottobre a Roma
  assert.deepEqual(todayInRome(new Date("2026-10-03T23:30:00Z")), { y: 2026, m: 10, d: 4 });
});

test("disponibilità: dal giorno dopo, domenica esclusa, a cavallo del mese", () => {
  const slots = availability({ y: 2026, m: 10, d: 3 }, 2);
  assert.equal(slots[0], "lunedì 5 ottobre alle 10:00");
  assert.equal(slots.at(-1), "martedì 6 ottobre alle 18:00");
  assert.equal(availability({ y: 2026, m: 10, d: 30 }, 2)[3], "lunedì 2 novembre alle 10:00");
});

test("testo per il modello", () => {
  const text = buildPrompt({ request: "Nome: Giulia", messages: [{ from: "agente", text: "Ciao" }, { from: "cliente", text: "Salve" }] },
    new Date("2026-10-03T10:00:00Z"));
  assert.match(text, /^Oggi è sabato 3 ottobre 2026\./);
  assert.match(text, /- lunedì 5 ottobre alle 10:00/);
  assert.match(text, /ASSISTENTE: Ciao\nCLIENTE: Salve/);
});

test("lo schema accetta solo le azioni previste", () => {
  const dati = { motivo: "", tempi: "", occupazione: "", decisori: "", mutuo: "", altre_agenzie: "", appuntamento: "" };
  assert.ok(DraftSchema.safeParse({ messaggio: "Ciao", azione: "continua", dati }).success);
  assert.ok(!DraftSchema.safeParse({ messaggio: "Ciao", azione: "regala_casa", dati }).success);
});

test("regole: presenti i punti fermi", () => {
  for (const rule of ["assistente digitale", "Non dici MAI un prezzo", "non lo rifiuti mai", "Non fai promesse a nome di Annamaria"]) {
    assert.ok(ASSISTANT_RULES.includes(rule), rule);
  }
});
