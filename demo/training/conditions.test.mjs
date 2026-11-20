// node --test conditions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rollConditions, VIEW_CONDITIONS, impactFor, rowAt, tableDope } from "./conditions.js";

const tab = JSON.parse(readFileSync(new URL("../ballistics_table.json", import.meta.url)));
const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);

test("rolled conditions stay in range", () => {
  for (let i = 0; i < 1000; i++) {
    const c = rollConditions(rng);
    assert.ok(Number.isInteger(c.range) && c.range >= 300 && c.range <= 900, JSON.stringify(c));
    assert.ok(c.wind >= 2 && c.wind <= 5 && Math.abs(c.wind * 10 - Math.round(c.wind * 10)) < 1e-9, JSON.stringify(c));
    assert.ok([1, 2, 3, 4, 5, 7, 8, 9, 10, 11].includes(c.windFrom), JSON.stringify(c));
    assert.ok(c.hour >= 7.5 && c.hour <= 17.01, JSON.stringify(c));
    assert.ok(["clear", "drizzle", "mist", "snow"].includes(c.weather), JSON.stringify(c));
    assert.ok(c.temp >= -6 && c.temp <= 24 && c.pressure >= 990 && c.pressure <= 1035, JSON.stringify(c));
    if (c.weather === "snow") assert.ok(c.temp <= 0, JSON.stringify(c));
    assert.ok([11, 12, 1].includes(c.clock), JSON.stringify(c));
    assert.ok(Math.abs(c.bearing - { 11: -30, 12: 0, 1: 30 }[c.clock]) <= 6, JSON.stringify(c));
  }
});

test("every wind hour is drawn; the cross value: full at 3 and 9, half at 1, 5, 7, 11; the side follows the hour", async () => {
  const { windFactor, windSide } = await import("./conditions.js");
  const seen = new Set(); for (let i = 0; i < 2000; i++) seen.add(rollConditions(rng).windFrom);
  assert.equal(seen.size, 10);
  assert.ok(Math.abs(windFactor(3) - 1) < 1e-9 && Math.abs(windFactor(9) - 1) < 1e-9 && Math.abs(windFactor(1) - 0.5) < 1e-9 && Math.abs(windFactor(11) - 0.5) < 1e-9);
  assert.ok(Math.abs(windFactor(2) - Math.sqrt(3) / 2) < 1e-9);
  const base = { range: 600, wind: 4, temp: 15, pressure: 1010 };
  const d9 = tableDope({ ...base, windFrom: 9 }, tab), d7 = tableDope({ ...base, windFrom: 7 }, tab), d1 = tableDope({ ...base, windFrom: 1 }, tab);
  assert.ok(d9.wind > 0 && d7.wind > 0 && d1.wind < 0);                          // from the left: correction left (> 0)
  assert.ok(Math.abs(d7.wind - d9.wind / 2) < 1e-9 && Math.abs(d1.wind + d9.wind / 2) < 1e-9);
  for (const h of [1, 2, 4, 5, 7, 8, 10, 11]) assert.equal(impactFor({ ...base, windFrom: h }, tableDope({ ...base, windFrom: h }, tab), [0, 0], tab).hit, true, "hour " + h);
});

test("the view conditions and their settings hit", () => {
  assert.deepEqual(VIEW_CONDITIONS, { range: 625, wind: 3.0, windFrom: 9, hour: 10, weather: "clear", clock: 12, bearing: 0 });
  assert.equal(impactFor(VIEW_CONDITIONS, { elev: 6.45, wind: 1.56 }, [0, 0], tab).hit, true);
});

test("cold dense air drops more than the tables (15 C, 1010 hPa) and needs more elevation", () => {
  const std = { range: 900, wind: 3, windFrom: 9 }, cold = { ...std, temp: -6, pressure: 1035 };
  const a = tableDope(std, tab), b = tableDope(cold, tab);
  assert.ok(b.elev > a.elev * 1.04 && b.elev < a.elev * 1.2, `${a.elev} -> ${b.elev}`);
  assert.equal(impactFor(cold, a, [0, 0], tab).y < 0, true);              // the table settings fall short in the cold
  assert.equal(impactFor(cold, b, [0, 0], tab).hit, true);
});

test("wind dialled the wrong way misses", () => {
  assert.equal(impactFor(VIEW_CONDITIONS, { elev: 6.45, wind: -1.56 }, [0, 0], tab).hit, false);
});

test("elevation error: 1 mrad misses at 900 m, fits at 300 m, 2 mrad misses at 300 m", () => {
  for (const [range, err, hit] of [[900, 1.0, false], [300, 1.0, true], [300, 2.0, false]]) {
    const c = { range, wind: 2.0, windFrom: 3 }, d = tableDope(c, tab);
    assert.equal(impactFor(c, { elev: d.elev, wind: d.wind }, [0, 0], tab).hit, true, "exact " + range);
    assert.equal(impactFor(c, { elev: d.elev + err, wind: d.wind }, [0, 0], tab).hit, hit, range + " +" + err);
  }
});

test("wind from 3 o'clock needs a right correction (negative = right)", () => {
  const d = tableDope({ range: 600, wind: 4, windFrom: 3 }, tab);
  assert.ok(d.wind < 0 && Math.abs(d.wind + 4 * 0.42) < 0.02, String(d.wind));
});

test("rowAt interpolates", () => {
  const r = rowAt(tab, 602.5), a = rowAt(tab, 600), b = rowAt(tab, 605);
  assert.ok(Math.abs(r[2] - (a[2] + b[2]) / 2) < 1e-9);
});

test("scenario 2 targets: nearest first, 100 m apart, within 300-900 m, the three hours", async () => {
  const { rollTargets } = await import("./conditions.js");
  for (let i = 0; i < 500; i++) {
    const t = rollTargets(rng);
    assert.equal(t.length, 3);
    assert.ok(t[0].range >= 300 && t[2].range <= 900 && t[1].range - t[0].range >= 100 && t[2].range - t[1].range >= 100, JSON.stringify(t));
    assert.deepEqual(t.map(x => x.clock).sort(), [1, 11, 12]);
    for (const x of t) assert.ok(Math.abs(x.bearing - { 11: -30, 12: 0, 1: 30 }[x.clock]) <= 6, JSON.stringify(x));
  }
});
