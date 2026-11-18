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
    assert.ok(c.windFrom === 9 || c.windFrom === 3);
    assert.ok(c.hour >= 7.5 && c.hour <= 17.01, JSON.stringify(c));
    assert.ok(["clear", "drizzle", "mist", "snow"].includes(c.weather), JSON.stringify(c));
    assert.ok(c.temp >= -6 && c.temp <= 24 && c.pressure >= 990 && c.pressure <= 1035, JSON.stringify(c));
    if (c.weather === "snow") assert.ok(c.temp <= 0, JSON.stringify(c));
  }
});

test("the view conditions and their settings hit", () => {
  assert.deepEqual(VIEW_CONDITIONS, { range: 625, wind: 3.0, windFrom: 9, hour: 10, weather: "clear" });
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
