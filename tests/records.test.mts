// Test della sincronizzazione senza database: controllo delle richieste.
// Uso: npx tsx --test tests/records.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS, ValidationError, parseRecords, parseSince } from "../lib/records.ts";

test("since: assente, valido, non valido", () => {
  assert.equal(parseSince(undefined), 0);
  assert.equal(parseSince(""), 0);
  assert.equal(parseSince("42"), 42);
  assert.equal(parseSince(["7"]), 7);
  for (const bad of ["-1", "abc", "1.5", "99999999999999999999"]) {
    assert.throws(() => parseSince(bad), ValidationError);
  }
});

test("schede valide: contenuto e cancellazione", () => {
  const records = parseRecords({
    records: [
      { collection: "contacts", id: "A1B2-C3", payload: { name: "Mario" } },
      { collection: "tasks", id: "t_1", deleted: true, payload: { ignorato: true } },
    ],
  });
  assert.deepEqual(records, [
    { collection: "contacts", id: "A1B2-C3", payload: { name: "Mario" }, deleted: false },
    { collection: "tasks", id: "t_1", payload: null, deleted: true },
  ]);
  assert.ok(COLLECTIONS.includes("externalListings"));
});

test("schede non valide", () => {
  const ok = { collection: "contacts", id: "a", payload: { x: 1 } };
  const bodies = [
    null,
    {},
    { records: "ciao" },
    { records: [] },
    { records: Array(201).fill(ok).map((r, i) => ({ ...r, id: `a${i}` })) },
    { records: [{ ...ok, collection: "intestatari" }] },
    { records: [{ ...ok, id: "" }] },
    { records: [{ ...ok, id: "../etc" }] },
    { records: [{ ...ok, id: "x".repeat(81) }] },
    { records: [{ ...ok, payload: "testo" }] },
    { records: [{ ...ok, payload: [1, 2] }] },
    { records: [{ ...ok, payload: null }] },
    { records: [ok, ok] },
    { records: [{ ...ok, payload: { big: "x".repeat(200_001) } }] },
    { records: [null] },
  ];
  for (const body of bodies) {
    assert.throws(() => parseRecords(body), ValidationError, JSON.stringify(body)?.slice(0, 80));
  }
});
