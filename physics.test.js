import { test } from "node:test";
import assert from "node:assert/strict";
import {
  G,
  DT,
  validateFriction,
  solveSystem,
  simulate,
  analyticalX,
} from "./physics.js";

const approx = (actual, expected, tol, msg) => {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? "aprox"}: esperado ${expected} ± ${tol}, obtenido ${actual}`
  );
};

// 1. Reposo claro: m2*g <= mu_s*m1*g -> a=0, T=m2*g, Fr=m2*g
test("1. reposo: m1=5, m2=1, mu_s=0.3 -> a=0, T=Fr=9.8", () => {
  const r = solveSystem({ m1: 5, m2: 1, mu_s: 0.3, mu_k: 0.2 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, true);
  assert.equal(r.a, 0);
  approx(r.T, 1 * G, 1e-9, "T");
  approx(r.Fr, 1 * G, 1e-9, "Fr");
});

// 2. Umbral límite: igualdad m2 = mu_s*m1 -> reposo (operador <=)
test("2. umbral: m1=4, m2=1.2, mu_s=0.3 -> reposo en el borde", () => {
  const r = solveSystem({ m1: 4, m2: 1.2, mu_s: 0.3, mu_k: 0.2 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, true);
  assert.equal(r.a, 0);
  approx(r.T, 1.2 * G, 1e-9, "T");
  approx(r.Fr, 1.2 * G, 1e-9, "Fr");
});

// 3. Movimiento sin rozamiento: a = m2*g/(m1+m2)
test("3. sin rozamiento: m1=3, m2=2 -> a=3.92, T=11.76", () => {
  const r = solveSystem({ m1: 3, m2: 2, mu_s: 0, mu_k: 0 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  approx(r.a, (2 * G) / 5, 1e-9, "a");
  approx(r.a, 3.92, 1e-9, "a=3.92");
  approx(r.T, 3 * 3.92, 1e-9, "T");
  approx(r.Fr, 0, 1e-12, "Fr");
});

// 4. Caso ancla del enunciado: m1=5, m2=2.5, mu≈0.41 -> a≈0.59, T≈23.03
test("4. ancla: m1=5, m2=2.5, mu_k=0.41 -> a≈0.59, T≈23.03", () => {
  // mu_s debe cumplir mu_k <= mu_s < m2/m1=0.5 para que haya movimiento.
  const r = solveSystem({ m1: 5, m2: 2.5, mu_s: 0.45, mu_k: 0.41 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  approx(r.a, 0.59, 0.02, "a");
  approx(r.T, 23.03, 0.15, "T");
  approx(r.Fr, 0.41 * 5 * G, 0.15, "Fr");
  // Coherencia: mu despejado de a coincide con 0.41
  const muBack = (2.5 - (r.a * (5 + 2.5)) / G) / 5;
  approx(muBack, 0.41, 0.02, "mu despejado");
});

// 5. Movimiento con rozamiento calculado a mano + equivalencia de T
test("5. rozamiento: m1=2, m2=1, mu_k=0.1 -> a≈2.6133", () => {
  const r = solveSystem({ m1: 2, m2: 1, mu_s: 0.2, mu_k: 0.1 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  const aEsp = (G - 0.1 * 2 * G) / 3; // (9.8-1.96)/3
  approx(r.a, aEsp, 1e-9, "a");
  approx(r.a, 2.613333, 1e-4, "a≈2.6133");
  approx(r.T, 2 * (r.a + 0.1 * G), 1e-9, "T=m1*(a+mu_k*g)");
  approx(r.T, 1 * (G - r.a), 1e-9, "T=m2*(g-a) equivalente");
  approx(r.Fr, 0.1 * 2 * G, 1e-9, "Fr");
});

// 6. Integración: paso fijo, error vs analítico y detención borde/suelo/reposo
test("6. integración: DT=0.005, error < 1e-2 y detenciones", () => {
  assert.equal(DT, 0.005, "paso fijo DT=0.005");

  // 6a. Sin obstáculos: el numérico sigue a 0.5*a*t^2
  const r = solveSystem({ m1: 2, m2: 1, mu_s: 0.2, mu_k: 0.1 });
  const sim = simulate({
    m1: 2,
    m2: 1,
    mu_s: 0.2,
    mu_k: 0.1,
    x0: 50,
    h0: 50,
    tMax: 2,
  });
  assert.equal(sim.executed, true);
  assert.equal(sim.dt, 0.005);
  const num = sim.trajectory[sim.trajectory.length - 1];
  approx(num.t, 2, 1e-9, "t final");
  approx(num.x, analyticalX(r.a, 2), 1e-2, "x numérico vs analítico");

  // 6b. Detención al borde (mesa corta)
  const borde = simulate({
    m1: 2,
    m2: 1,
    mu_s: 0.2,
    mu_k: 0.1,
    x0: 0.5,
    h0: 10,
    tMax: 10,
  });
  assert.equal(borde.executed, true);
  assert.equal(borde.final.stopped, true);
  assert.equal(borde.final.reason, "borde");
  approx(borde.final.x, 0.5, 1e-9, "x clamp borde");
  assert.equal(borde.final.v, 0);

  // 6c. Detención al suelo (m2 baja)
  const suelo = simulate({
    m1: 2,
    m2: 1,
    mu_s: 0.2,
    mu_k: 0.1,
    x0: 10,
    h0: 0.5,
    tMax: 10,
  });
  assert.equal(suelo.executed, true);
  assert.equal(suelo.final.stopped, true);
  assert.equal(suelo.final.reason, "suelo");
  approx(suelo.final.y, 0, 1e-9, "y clamp suelo");
  assert.equal(suelo.final.v, 0);

  // 6d. En reposo no se mueve
  const quieto = simulate({
    m1: 5,
    m2: 1,
    mu_s: 0.3,
    mu_k: 0.2,
    x0: 2,
    h0: 2,
    tMax: 3,
  });
  assert.equal(quieto.executed, true);
  assert.equal(quieto.final.reason, "reposo");
  assert.equal(quieto.final.x, 0);
  assert.equal(quieto.final.v, 0);
  assert.equal(quieto.final.y, 2);
});

// 7. Restricción mu_k <= mu_s: si se viola, no se ejecuta + aviso (sin throw)
test("7. mu_k > mu_s bloquea solve y simulate con aviso", () => {
  const vf = validateFriction(0.3, 0.5);
  assert.equal(vf.ok, false);
  assert.ok(vf.warning.includes("mu_k"));

  const r = solveSystem({ m1: 5, m2: 2.5, mu_s: 0.3, mu_k: 0.5 });
  assert.equal(r.executed, false);
  assert.equal(r.a, null);
  assert.ok(r.warning.includes("mu_k"));

  const s = simulate({
    m1: 5,
    m2: 2.5,
    mu_s: 0.3,
    mu_k: 0.5,
    x0: 2,
    h0: 2,
    tMax: 3,
  });
  assert.equal(s.executed, false);
  assert.ok(s.warning.includes("mu_k"));
  assert.deepEqual(s.trajectory, []);
  assert.equal(s.final, null);
  assert.equal(s.steps, 0);
});

// 8. Empuje insuficiente: el estático lo absorbe -> reposo con Fr = m2*g + F
test("8. empuje insuficiente: m1=5, m2=1, mu_s=0.3, F=2N -> reposo", () => {
  const r = solveSystem({ m1: 5, m2: 1, mu_s: 0.3, mu_k: 0.2, F_push: 2, dt_push: 0.2 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, true);
  assert.equal(r.a, 0);
  approx(r.T, 1 * G, 1e-9, "T=m2*g");
  approx(r.Fr, 1 * G + 2, 1e-9, "Fr=m2*g+F");
  assert.equal(r.push.unstuck, false);

  const s = simulate({
    m1: 5, m2: 1, mu_s: 0.3, mu_k: 0.2, x0: 2, h0: 2, tMax: 3,
    F_push: 2, dt_push: 0.2,
  });
  assert.equal(s.executed, true);
  assert.equal(s.final.reason, "reposo");
  assert.equal(s.final.x, 0);
  assert.equal(s.final.v, 0);
});

// 9. Empuje que despega y luego la fricción detiene (reason='rozamiento')
test("9. empuje despega y fricción frena: m1=5, m2=0.5, F=15N x 0.2s", () => {
  const r = solveSystem({ m1: 5, m2: 0.5, mu_s: 0.3, mu_k: 0.2, F_push: 15, dt_push: 0.2 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  assert.equal(r.push.unstuck, true);
  // m2 sola no despegaría: 0.5*9.8=4.9 <= 0.3*5*9.8=14.7
  approx(r.push.a_push, (0.5 * G + 15 - 0.2 * 5 * G) / 5.5, 1e-9, "a_push");
  approx(r.a, (0.5 * G - 0.2 * 5 * G) / 5.5, 1e-9, "a libre negativa");
  assert.ok(r.a < 0, "el peso no sostiene el movimiento");

  const s = simulate({
    m1: 5, m2: 0.5, mu_s: 0.3, mu_k: 0.2, x0: 2, h0: 2, tMax: 10,
    F_push: 15, dt_push: 0.2,
  });
  assert.equal(s.executed, true);
  assert.equal(s.final.stopped, true);
  assert.equal(s.final.reason, "rozamiento");
  assert.equal(s.final.v, 0);
  assert.ok(s.final.x > 0 && s.final.x < 2, `x (${s.final.x}) entre 0 y 2`);
  // Analítico: x1=0.5*a_push*dt^2, v1=a_push*dt, x2=x1+v1^2/(2|a|)
  const aP = r.push.a_push, v1 = aP * 0.2;
  const xEsp = 0.5 * aP * 0.04 + (v1 * v1) / (2 * Math.abs(r.a));
  approx(s.final.x, xEsp, 1e-3, "x de frenado");
});

// 10. Empuje sobre sistema ya móvil + validación de parámetros
test("10. empuje en marcha: m1=2, m2=1, F=3N x 0.1s, tMax=1s", () => {
  const r = solveSystem({ m1: 2, m2: 1, mu_s: 0.2, mu_k: 0.1, F_push: 3, dt_push: 0.1 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  const aP = (G + 3 - 0.1 * 2 * G) / 3;
  const aF = (G - 0.1 * 2 * G) / 3;
  approx(r.push.a_push, aP, 1e-9, "a_push");
  approx(r.a, aF, 1e-9, "a libre");

  const s = simulate({
    m1: 2, m2: 1, mu_s: 0.2, mu_k: 0.1, x0: 50, h0: 50, tMax: 1,
    F_push: 3, dt_push: 0.1,
  });
  assert.equal(s.executed, true);
  assert.equal(s.final.reason, "tMax");
  const v1 = aP * 0.1, x1 = 0.5 * aP * 0.01;
  approx(s.final.v, v1 + aF * 0.9, 1e-6, "v bifásica");
  approx(s.final.x, x1 + v1 * 0.9 + 0.5 * aF * 0.81, 1e-6, "x bifásica");

  // Regresión: F_push=0 reproduce el caso clásico (test 5)
  const clas = solveSystem({ m1: 2, m2: 1, mu_s: 0.2, mu_k: 0.1 });
  approx(clas.a, aF, 1e-12, "sin empuje igual que antes");

  // Inválidos: no se ejecuta, solo aviso
  const bad = solveSystem({ m1: 2, m2: 1, mu_s: 0.2, mu_k: 0.1, F_push: -3, dt_push: 0.1 });
  assert.equal(bad.executed, false);
  assert.ok(bad.warning.includes("F_push"));
  const bad2 = simulate({
    m1: 2, m2: 1, mu_s: 0.2, mu_k: 0.1, x0: 2, h0: 2, tMax: 3,
    F_push: 3, dt_push: -0.1,
  });
  assert.equal(bad2.executed, false);
  assert.deepEqual(bad2.trajectory, []);
});
