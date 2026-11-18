// node --test check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNumber, checkAction, checkMark, checkNumber, checkChoice, optionsFor, scoreExam, resolve } from "./check.js";
import { STEPS, ACTION_POOL } from "./steps_scene1.js";

const C = { range: 625, wind: 3.0, windFrom: 9 };
const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(42);

test("parseNumber reads commas, units and junk", () => {
  assert.equal(parseNumber("1,6"), 1.6);
  assert.equal(parseNumber("625 m"), 625);
  assert.equal(parseNumber(" 6.5mrad"), 6.5);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber(""), null);
});

test("checkAction: nothing picked, wrong, right", () => {
  const st = { target: "scope_elevation", action: "Ustaw bęben na zero" };
  assert.equal(checkAction(st, { target: null, action: null }), "none");
  assert.equal(checkAction(st, { target: "scope_windage", action: "Ustaw bęben na zero" }), "wrong");
  assert.equal(checkAction(st, { target: "scope_elevation", action: "Coś innego" }), "wrong");
  assert.equal(checkAction(st, { target: "scope_elevation", action: "Ustaw bęben na zero" }), "ok");
});

test("checkMark: 10 px tolerance", () => {
  assert.equal(checkMark({}, 6, 7), true);
  assert.equal(checkMark({}, 8, 7), false);
});

test("checkNumber: number or function answers, absolute or percent tolerance", () => {
  assert.equal(checkNumber({ answer: c => c.range, tol: "5%" }, "640", C), true);
  assert.equal(checkNumber({ answer: c => c.range, tol: "5%" }, "660", C), false);
  assert.equal(checkNumber({ answer: 1.6, tol: 0.1 }, "1,7", C), true);
  assert.equal(checkNumber({ answer: 1.6, tol: 0.1 }, "1,75", C), false);
  assert.equal(checkNumber({ answer: 1.6, tol: 0.1 }, "x", C), false);
});

test("checkChoice with a condition-dependent answer", () => {
  const st = { correct: c => c.windFrom === 9 ? "z lewej" : "z prawej" };
  assert.equal(checkChoice(st, "z lewej", C), true);
  assert.equal(checkChoice(st, "z lewej", { ...C, windFrom: 3 }), false);
});

test("optionsFor gives 4 unique options with the right one", () => {
  const st = STEPS.find(s => s.kind === "action");
  const o = optionsFor(st, ACTION_POOL, rng);
  assert.equal(o.length, 4); assert.equal(new Set(o).size, 4); assert.ok(o.includes(st.action));
});

test("scoreExam: 80% passes, missing answers count as wrong", () => {
  const steps = Array.from({ length: 10 }, (_, i) => ({ id: "k" + i }));
  const eight = new Map(steps.map((s, i) => [s.id, i < 8]));
  assert.deepEqual(scoreExam(steps, eight), { points: 8, total: 10, percent: 80, passed: true });
  const seven = new Map(steps.slice(0, 9).map((s, i) => [s.id, i < 7]));
  assert.equal(scoreExam(steps, seven).passed, false);
});

test("steps cover every narration key exactly once, in order", () => {
  const keys = JSON.parse(readFileSync(new URL("../audio/scene1/manifest.json", import.meta.url))).map(m => m.key);
  assert.deepEqual(STEPS.flatMap(s => s.play), keys);
});

test("every step has the fields its kind needs", () => {
  for (const s of STEPS) {
    assert.ok(s.id && s.chapter && s.ask && s.hint, s.id);
    if (s.kind === "action") assert.ok(s.target && s.action, s.id);
    else if (s.kind === "number") assert.ok(s.answer != null && s.unit && s.tol != null, s.id);
    else if (s.kind === "choice") assert.ok(s.correct && resolve(s.options, C).includes(resolve(s.correct, C)), s.id);
    else if (s.kind === "mark") assert.ok(resolve(s.mark, C).overlay === "card", s.id);
    else assert.equal(s.kind, "dial", s.id);
  }
  assert.equal(new Set(STEPS.map(s => s.id)).size, STEPS.length);
});

test("range card mark follows the range", () => {
  const m = STEPS.find(s => s.kind === "mark");
  assert.deepEqual(resolve(m.mark, C), { overlay: "card", x: 200, y: 210 - 625 * 0.19 });
});

test("choice options are shuffled: the right one is not always first", async () => {
  const { choiceOptions } = await import("./check.js");
  const st = STEPS.find(s => s.id === "prone"); let first = 0;
  for (let i = 0; i < 60; i++) { const o = choiceOptions(st, C, rng); assert.equal(o.length, 4); assert.ok(o.includes(st.correct)); if (o[0] === st.correct) first++; }
  assert.ok(first < 40, "first " + first);
});

test("the range question does not hold on the formula (it shows the answer)", () => {
  const st = STEPS.find(s => s.id === "range");
  assert.ok(st.hold && !st.hold.key.startsWith("s11."), JSON.stringify(st.hold));
});
