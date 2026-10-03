// Test dell'archiviazione dei lead senza database: controllo delle richieste.
// Uso: npx tsx --test tests/leads-archive.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidationError, parseArchiveRequest } from "../lib/leads-archive.ts";

test("richieste valide", () => {
  assert.deepEqual(parseArchiveRequest({ ids: [25, "26", "26"] }), { ids: ["25", "26"], archived: true });
  assert.deepEqual(parseArchiveRequest({ ids: ["a1b2-c3"], archived: false }), { ids: ["a1b2-c3"], archived: false });
});

test("richieste non valide", () => {
  for (const body of [null, {}, { ids: [] }, { ids: "25" }, { ids: [null] }, { ids: ["1; drop table leads"] },
    { ids: [{}] }, { ids: Array(201).fill(1) }, { ids: [1], archived: "sì" }]) {
    assert.throws(() => parseArchiveRequest(body), ValidationError, JSON.stringify(body)?.slice(0, 60));
  }
});
