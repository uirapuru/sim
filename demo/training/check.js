// Grading for the training and the exam. Pure functions, no DOM: the runner (runner.js) calls them with what the
// student clicked or typed and with the drawn conditions c = { range, wind, windFrom }.

// a step field may be a value or a function of the conditions
export const resolve = (v, c) => typeof v === "function" ? v(c) : v;

export function parseNumber(text) {
  const m = String(text ?? "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// "none": nothing in the scene under the click (sky, empty ground) - not a mistake
export function checkAction(step, { target, action }) {
  if (target == null) return "none";
  return target === step.target && action === step.action ? "ok" : "wrong";
}

export const checkMark = (step, dx, dy) => Math.hypot(dx, dy) <= (step.tol ?? 10);

export function checkNumber(step, text, c) {
  const v = parseNumber(text); if (v == null) return false;
  const want = resolve(step.answer, c), t = step.tol;
  const tol = typeof t === "string" && t.endsWith("%") ? Math.abs(want) * parseFloat(t) / 100 : t;
  return Math.abs(v - want) <= tol + 1e-9;
}

export const checkChoice = (step, picked, c) => picked === resolve(step.correct, c);

// the options of a choice step in random order (the data lists the right one first)
export function choiceOptions(step, c, rng = Math.random) {
  const o = [...resolve(step.options, c)];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}

// the right action plus three other actions of the lesson, shuffled
export function optionsFor(step, pool, rng = Math.random) {
  const others = pool.filter(a => a !== step.action);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const o = [step.action, ...others.slice(0, 3)];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}

// answers: step id -> true/false; a step with no answer (time ran out) counts as wrong
export function scoreExam(steps, answers) {
  const total = steps.length, points = steps.filter(s => answers.get(s.id) === true).length;
  const percent = total ? Math.round(points / total * 100) : 0;
  return { points, total, percent, passed: percent >= 80 };
}
