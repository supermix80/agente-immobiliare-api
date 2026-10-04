// Test dei file dei documenti senza database: controllo delle richieste.
// Uso: npx tsx --test tests/files.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_FILE_BYTES, ValidationError, parseFile, parseId } from "../lib/files.ts";

const ok = { contactId: "A1B2-C3", filename: "D4E5.jpg", contentType: "image/jpeg", data: Buffer.from("ciao").toString("base64") };

test("file valido", () => {
  const file = parseFile(ok);
  assert.equal(file.content.toString(), "ciao");
  assert.equal(file.filename, "D4E5.jpg");
  assert.equal(parseId("6F1E-22"), "6F1E-22");
  assert.equal(parseId(["6F1E-22"]), "6F1E-22");
});

test("file non validi", () => {
  const big = Buffer.alloc(MAX_FILE_BYTES + 1).toString("base64");
  for (const body of [null, {}, { ...ok, contactId: "" }, { ...ok, filename: "../../etc/passwd" }, { ...ok, filename: "a/b.jpg" },
    { ...ok, filename: "a..jpg" }, { ...ok, contentType: "text/html" }, { ...ok, data: "" }, { ...ok, data: "non è base64!" },
    { ...ok, data: big }, { ...ok, data: 42 }]) {
    assert.throws(() => parseFile(body), ValidationError, JSON.stringify(body)?.slice(0, 80));
  }
  for (const id of ["", "../x", "a b", "x".repeat(81), undefined]) {
    assert.throws(() => parseId(id), ValidationError);
  }
});
