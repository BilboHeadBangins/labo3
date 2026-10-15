import { test } from "node:test";
import assert from "node:assert/strict";
import { G, DT, solveIncline, simulateIncline, analyticalS } from "./incline.js";

const approx = (actual, expected, tol, msg) => {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? "aprox"}: esperado ${expected} ± ${tol}, obtenido ${actual}`
  );
};

// 1. Reposo: tan20°≈0.364 <= μs=0.4
test("1. reposo: m=2, θ=20°, mu_s=0.4 -> a=0, Fr=m·g·sinθ", () => {
  const r = solveIncline({ m: 2, theta_deg: 20, mu_s: 0.4, mu_k: 0.3 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, true);
  assert.equal(r.a, 0);
  approx(r.N, 2 * G * Math.cos((20 * Math.PI) / 180), 1e-9, "N");
  approx(r.Fr, 2 * G * Math.sin((20 * Math.PI) / 180), 1e-9, "Fr");
});

// 2. Umbral: tan45° = 1 = μs -> reposo (igualdad exacta en flotantes,
// sinθ y cosθ son el mismo double, así se testea el operador <=)
test("2. umbral: θ=45°, mu_s=1 -> reposo en el borde", () => {
  const r = solveIncline({ m: 1, theta_deg: 45, mu_s: 1, mu_k: 0.9 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, true);
  assert.equal(r.a, 0);
});

// 3. Sin rozamiento θ=30° -> a=g/2=4.9
test("3. sin rozamiento: θ=30° -> a=4.9, Fr=0", () => {
  const r = solveIncline({ m: 3, theta_deg: 30, mu_s: 0, mu_k: 0 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  approx(r.a, G / 2, 1e-9, "a=4.9");
  approx(r.N, 3 * G * (Math.sqrt(3) / 2), 1e-9, "N");
  approx(r.Fr, 0, 1e-12, "Fr");
});

// 4. Caso calculado a mano: m=2, θ=30°, μk=0.2
test("4. calculado: m=2, θ=30°, mu_k=0.2 -> a≈3.20", () => {
  const r = solveIncline({ m: 2, theta_deg: 30, mu_s: 0.3, mu_k: 0.2 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  approx(r.a, G * (0.5 - 0.2 * (Math.sqrt(3) / 2)), 1e-9, "a");
  approx(r.a, 3.203, 1e-3, "a≈3.20");
  approx(r.N, 2 * G * (Math.sqrt(3) / 2), 1e-9, "N≈16.97");
  approx(r.Fr, 0.2 * r.N, 1e-9, "Fr≈3.40");
});

// 5. Caída libre θ=90° -> a=g, N=Fr=0
test("5. vertical: θ=90° -> a=g, N=Fr=0", () => {
  const r = solveIncline({ m: 1, theta_deg: 90, mu_s: 0.4, mu_k: 0.3 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  approx(r.a, G, 1e-9, "a=g");
  approx(r.N, 0, 1e-9, "N");
  approx(r.Fr, 0, 1e-9, "Fr");
});

// 6. Integración: paso fijo, error vs analítico y detención en la base
test("6. integración: DT=0.005, error pequeño y paradas", () => {
  assert.equal(DT, 0.005, "paso fijo DT=0.005");

  // 6a. Sin obstáculos: el numérico sigue a 0.5·a·t²
  const r = solveIncline({ m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05 });
  const sim = simulateIncline({
    m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05, L: 500, tMax: 2,
  });
  assert.equal(sim.executed, true);
  assert.equal(sim.dt, 0.005);
  const last = sim.trajectory[sim.trajectory.length - 1];
  approx(last.t, 2, 1e-9, "t final");
  approx(last.s, analyticalS(r.a, 2), 1e-9, "s numérico vs analítico");

  // 6b. Detención en la base (plano corto)
  const base = simulateIncline({
    m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05, L: 0.5, tMax: 10,
  });
  assert.equal(base.executed, true);
  assert.equal(base.final.stopped, true);
  assert.equal(base.final.reason, "base");
  approx(base.final.s, 0.5, 1e-9, "s clamp base");
  assert.equal(base.final.v, 0);

  // 6c. En reposo no se mueve
  const quieto = simulateIncline({
    m: 2, theta_deg: 10, mu_s: 0.4, mu_k: 0.3, L: 3, tMax: 3,
  });
  assert.equal(quieto.executed, true);
  assert.equal(quieto.final.reason, "reposo");
  assert.equal(quieto.final.s, 0);
  assert.equal(quieto.final.v, 0);

  // 6d. μk > μs bloquea con aviso (sin throw)
  const bad = simulateIncline({
    m: 2, theta_deg: 30, mu_s: 0.2, mu_k: 0.5, L: 3, tMax: 3,
  });
  assert.equal(bad.executed, false);
  assert.ok(bad.warning.includes("mu_k"));
  assert.deepEqual(bad.trajectory, []);

  // 6e. Ángulo inválido
  const badTh = solveIncline({ m: 1, theta_deg: 120, mu_s: 0.3, mu_k: 0.2 });
  assert.equal(badTh.executed, false);
  assert.ok(badTh.warning.includes("theta"));
});

// 7. Empuje insuficiente: el estático lo absorbe -> reposo con Fr = m·g·sinθ + F
test("7. empuje insuficiente: m=2, θ=10°, mu_s=0.4, F=2N -> reposo", () => {
  const r = solveIncline({ m: 2, theta_deg: 10, mu_s: 0.4, mu_k: 0.3, F_push: 2, dt_push: 0.2 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, true);
  assert.equal(r.a, 0);
  approx(r.Fr, 2 * G * Math.sin((10 * Math.PI) / 180) + 2, 1e-9, "Fr=m·g·sinθ+F");
  assert.equal(r.push.unstuck, false);

  const s = simulateIncline({
    m: 2, theta_deg: 10, mu_s: 0.4, mu_k: 0.3, L: 3, tMax: 3,
    F_push: 2, dt_push: 0.2,
  });
  assert.equal(s.executed, true);
  assert.equal(s.final.reason, "reposo");
  assert.equal(s.final.s, 0);
  assert.equal(s.final.v, 0);
});

// 8. Empuje que despega y luego la fricción detiene (reason='rozamiento')
test("8. empuje despega y fricción frena: m=2, θ=10°, F=8N x 0.2s", () => {
  const r = solveIncline({ m: 2, theta_deg: 10, mu_s: 0.4, mu_k: 0.3, F_push: 8, dt_push: 0.2 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  assert.equal(r.push.unstuck, true);
  // solo no despegaría: m·g·sin10°≈3.40 <= μs·N≈7.72
  const sin10 = Math.sin((10 * Math.PI) / 180), cos10 = Math.cos((10 * Math.PI) / 180);
  approx(r.push.a_push, G * sin10 + 8 / 2 - 0.3 * G * cos10, 1e-9, "a_push");
  approx(r.a, G * (sin10 - 0.3 * cos10), 1e-9, "a libre negativa");
  assert.ok(r.a < 0, "el peso no sostiene el movimiento");

  const s = simulateIncline({
    m: 2, theta_deg: 10, mu_s: 0.4, mu_k: 0.3, L: 3, tMax: 10,
    F_push: 8, dt_push: 0.2,
  });
  assert.equal(s.executed, true);
  assert.equal(s.final.stopped, true);
  assert.equal(s.final.reason, "rozamiento");
  assert.equal(s.final.v, 0);
  assert.ok(s.final.s > 0 && s.final.s < 3, `s (${s.final.s}) entre 0 y 3`);
  // Analítico: s1=0.5·a_push·dt², v1=a_push·dt, s2=s1+v1²/(2|a|)
  const v1 = r.push.a_push * 0.2;
  const sEsp = 0.5 * r.push.a_push * 0.04 + (v1 * v1) / (2 * Math.abs(r.a));
  approx(s.final.s, sEsp, 1e-3, "s de frenado");
});

// 9. Empuje en sistema ya móvil + validación de parámetros
test("9. empuje en marcha: m=2, θ=30°, F=3N x 0.1s, tMax=1s", () => {
  const r = solveIncline({ m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05, F_push: 3, dt_push: 0.1 });
  assert.equal(r.executed, true);
  assert.equal(r.atRest, false);
  const aP = G * 0.5 + 3 / 2 - 0.05 * G * (Math.sqrt(3) / 2);
  const aF = G * (0.5 - 0.05 * (Math.sqrt(3) / 2));
  approx(r.push.a_push, aP, 1e-9, "a_push");
  approx(r.a, aF, 1e-9, "a libre");

  const s = simulateIncline({
    m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05, L: 500, tMax: 1,
    F_push: 3, dt_push: 0.1,
  });
  assert.equal(s.executed, true);
  assert.equal(s.final.reason, "tMax");
  const v1 = aP * 0.1, s1 = 0.5 * aP * 0.01;
  approx(s.final.v, v1 + aF * 0.9, 1e-6, "v bifásica");
  approx(s.final.s, s1 + v1 * 0.9 + 0.5 * aF * 0.81, 1e-6, "s bifásica");

  // Regresión: F_push=0 reproduce el caso clásico
  const clas = solveIncline({ m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05 });
  approx(clas.a, aF, 1e-12, "sin empuje igual que antes");

  // Inválidos: no se ejecuta, solo aviso
  const bad = solveIncline({ m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05, F_push: -3, dt_push: 0.1 });
  assert.equal(bad.executed, false);
  assert.ok(bad.warning.includes("F_push"));
  const bad2 = simulateIncline({
    m: 2, theta_deg: 30, mu_s: 0.1, mu_k: 0.05, L: 3, tMax: 3,
    F_push: 3, dt_push: -0.1,
  });
  assert.equal(bad2.executed, false);
  assert.deepEqual(bad2.trajectory, []);
});
