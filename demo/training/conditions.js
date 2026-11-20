// Conditions of one training or exam attempt (drawn once before it) and where a shot lands with the student's
// own settings. Tables: ballistics_table.json (tools/weapons/ballistics_tables.py).
// Conventions as in scene1.js: dial.wind > 0 = correction to the left; x > 0 = right of the gong centre, y > 0 = up.

export const VIEW_CONDITIONS = { range: 625, wind: 3.0, windFrom: 9, hour: 10, weather: "clear", clock: 12, bearing: 0 };

// direction to the target (author, 19 XI): 11, 12 or 1 o'clock from the stand's axis (12 = straight ahead, one hour =
// 30 degrees); bearing in degrees, > 0 = right of the axis, a few degrees off the full hour so it is read by eye.
// The wind (windFrom) is reckoned from the line of fire, the shooter turns to the target.
export const CLOCK_DEG = { 11: -30, 12: 0, 1: 30 };

// wind from any clock hour but 12 and 6 (author, 20 XI); hours are reckoned from the line of fire. The cross part of
// the wind moves the bullet: sin(hour x 30 deg) of it - full at 3 and 9, 0.87 at 2, 4, 8, 10, half at 1, 5, 7, 11.
// From 7-11 (left) the bullet goes right: the correction is to the left (+1); from 1-5 (right) to the right (-1)
export const WIND_HOURS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11];
export const windFactor = h => Math.abs(Math.sin(h * Math.PI / 6));
export const windSide = h => h > 6 ? 1 : -1;

// scenario 2 (author, 20 XI): three gongs, each at its own range and clock hour; returned from the nearest to the
// farthest (the order of fire). Ranges at least 100 m apart, hours 11, 12 and 1 in a random order
export function rollTargets(rng = Math.random) {
  const r1 = 300 + Math.floor(rng() * 151), r2 = r1 + 100 + Math.floor(rng() * (700 - r1 - 100 + 1)), r3 = r2 + 100 + Math.floor(rng() * (900 - r2 - 100 + 1));
  const hours = [11, 12, 1]; for (let i = 2; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [hours[i], hours[j]] = [hours[j], hours[i]]; }
  return [r1, r2, r3].map((range, i) => { const clock = hours[i]; return { range, clock, bearing: Math.round((CLOCK_DEG[clock] + (rng() - 0.5) * 12) * 10) / 10 }; });
}

// weather: "clear", "drizzle" (light rain under cloud), "mist" (the gong still in sight, paler) or now and then "snow"
// (a little snow on the fields, light snowfall)
export const WEATHER = { clear: "pogodnie", drizzle: "drobny deszcz", mist: "lekka mgła", snow: "lekki śnieg" };
// the ballistic tables are for this air; other temperature and pressure need a correction (author, 18 XI)
export const TABLE_ATM = { temp: 15, pressure: 1010 };

// hour: daylight of the scene's season (September sun), 7:30-17:00 in 5-minute steps;
// temperature [deg C] and pressure [hPa] to suit the weather
export function rollConditions(rng = Math.random) {
  const range = 300 + Math.floor(rng() * 601), wind = (20 + Math.floor(rng() * 31)) / 10, windFrom = WIND_HOURS[Math.floor(rng() * WIND_HOURS.length)];
  const hour = 7.5 + Math.floor(rng() * 115) * 5 / 60, w = rng();
  const weather = w < 0.43 ? "clear" : w < 0.65 ? "drizzle" : w < 0.88 ? "mist" : "snow";
  const span = (a, b, step = 1) => a + Math.floor(rng() * ((b - a) / step + 1)) * step;
  const [t0, t1, p0, p1] = { clear: [5, 24, 1000, 1030], drizzle: [4, 14, 990, 1010], mist: [0, 10, 1008, 1030], snow: [-6, 0, 1000, 1035] }[weather];
  const temp = span(t0 * 2, t1 * 2) / 2, pressure = span(p0, p1);
  const clock = [11, 12, 1][Math.floor(rng() * 3)], bearing = Math.round((CLOCK_DEG[clock] + (rng() - 0.5) * 12) * 10) / 10;
  return { range, wind, windFrom, hour, weather, temp, pressure, clock, bearing };
}

// air density relative to the tables' air (dry air: pressure over absolute temperature)
export const densityRatio = c => ((c.pressure ?? TABLE_ATM.pressure) / TABLE_ATM.pressure) * ((273.15 + TABLE_ATM.temp) / (273.15 + (c.temp ?? TABLE_ATM.temp)));
// the air of c at range d: the time the bullet loses to drag (time of flight over the vacuum time) grows with the
// density; the drop goes with the square of the time of flight, the wind drift with the lost time
export function atmK(c, tab, d) {
  const r = rowAt(tab, d), rho = densityRatio(c); if (!r[1]) return { drop: 1, drift: rho, tof: 0 };
  const v0 = tab.rows[1][0] / tab.rows[1][1], tv = d / v0, tof = tv + (r[1] - tv) * rho;
  return { drop: (tof / r[1]) ** 2, drift: rho, tof };
}
export const hourText = h => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round(h % 1 * 60)).padStart(2, "0")}`;

// [range, time, drop, drift per 1 m/s] at any range (linear between the 5 m rows)
export function rowAt(tab, d) {
  const R = tab.rows; let i = 0; while (i < R.length - 2 && R[i + 1][0] < d) i++;
  const a = R[i], b = R[i + 1], f = Math.max(0, Math.min(1, (d - a[0]) / (b[0] - a[0])));
  return a.map((v, k) => v + (b[k] - v) * f);
}

// the exact settings for c (what the tables give when read without rounding)
export function tableDope(c, tab) {
  const r = rowAt(tab, c.range), side = windSide(c.windFrom) * windFactor(c.windFrom), k = atmK(c, tab, c.range);
  return { elev: r[2] * k.drop / c.range * 1000, wind: side * r[3] * k.drift * c.wind / c.range * 1000 };
}

// disp: [right, up] in mrad, the shot's own dispersion
export function impactFor(c, dial, disp, tab) {
  const r = rowAt(tab, c.range), k = c.range / 1000, side = windSide(c.windFrom) * windFactor(c.windFrom), a = atmK(c, tab, c.range);
  const y = -r[2] * a.drop + (dial.elev + disp[1]) * k, x = side * r[3] * a.drift * c.wind - (dial.wind - disp[0]) * k;
  return { x, y, hit: Math.abs(x) <= 0.25 && Math.abs(y) <= 0.5, tof: a.tof };
}
