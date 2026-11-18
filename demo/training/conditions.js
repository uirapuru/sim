// Conditions of one training or exam attempt (drawn once before it) and where a shot lands with the student's
// own settings. Tables: ballistics_table.json (tools/weapons/ballistics_tables.py).
// Conventions as in scene1.js: dial.wind > 0 = correction to the left; x > 0 = right of the gong centre, y > 0 = up.

export const VIEW_CONDITIONS = { range: 625, wind: 3.0, windFrom: 9 };

export function rollConditions(rng = Math.random) {
  return { range: 300 + Math.floor(rng() * 601), wind: (20 + Math.floor(rng() * 31)) / 10, windFrom: rng() < 0.5 ? 9 : 3 };
}

// [range, time, drop, drift per 1 m/s] at any range (linear between the 5 m rows)
export function rowAt(tab, d) {
  const R = tab.rows; let i = 0; while (i < R.length - 2 && R[i + 1][0] < d) i++;
  const a = R[i], b = R[i + 1], f = Math.max(0, Math.min(1, (d - a[0]) / (b[0] - a[0])));
  return a.map((v, k) => v + (b[k] - v) * f);
}

// the exact settings for c (what the tables give when read without rounding)
export function tableDope(c, tab) {
  const r = rowAt(tab, c.range), side = c.windFrom === 9 ? 1 : -1;
  return { elev: r[2] / c.range * 1000, wind: side * r[3] * c.wind / c.range * 1000 };
}

// disp: [right, up] in mrad, the shot's own dispersion
export function impactFor(c, dial, disp, tab) {
  const r = rowAt(tab, c.range), k = c.range / 1000, side = c.windFrom === 9 ? 1 : -1;
  const y = -r[2] + (dial.elev + disp[1]) * k, x = side * r[3] * c.wind - (dial.wind - disp[0]) * k;
  return { x, y, hit: Math.abs(x) <= 0.25 && Math.abs(y) <= 0.5, tof: r[1] };
}
