// Núcleo física: bloque que desliza por un plano inclinado con rozamiento.
// Convención: s = distancia descendida a lo largo del plano desde arriba (s(0) = 0),
// v >= 0 = descendiendo. Reposo si tanθ <= μs; si no, a = g·(sinθ − μk·cosθ).
// Reutiliza G, DT y validateFriction del módulo de la polea.

import { G, DT, validateFriction } from "./physics.js";

export { G, DT };

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const rad = (deg) => (deg * Math.PI) / 180;

// Resuelve el estado dinámico. Soporta empujón opcional ladera abajo:
// F_push (N) durante dt_push (s). El empujón suma a m·g·sinθ para vencer al
// rozamiento estático; en marcha, a_push = g·sinθ + F/m − μk·g·cosθ durante
// el empujón y a = g·(sinθ − μk·cosθ) después (N y Fr iguales en ambas fases).
// Con F_push=0 o dt_push=0 el resultado es idéntico al clásico.
// Retorna { executed:false, warning } si inválido.
export function solveIncline({ m, theta_deg, mu_s, mu_k, F_push = 0, dt_push = 0 }) {
  if (!isFiniteNumber(m) || !isFiniteNumber(theta_deg)) {
    return {
      executed: false, atRest: null, a: null, N: null, Fr: null,
      warning: "m y theta_deg deben ser números finitos.",
    };
  }
  if (m <= 0) {
    return {
      executed: false, atRest: null, a: null, N: null, Fr: null,
      warning: "m debe ser > 0.",
    };
  }
  if (theta_deg < 0 || theta_deg > 90) {
    return {
      executed: false, atRest: null, a: null, N: null, Fr: null,
      warning: "theta_deg debe estar entre 0 y 90.",
    };
  }
  const vf = validateFriction(mu_s, mu_k);
  if (!vf.ok) {
    return {
      executed: false, atRest: null, a: null, N: null, Fr: null, push: null,
      warning: vf.warning,
    };
  }
  if (!isFiniteNumber(F_push) || !isFiniteNumber(dt_push)) {
    return {
      executed: false, atRest: null, a: null, N: null, Fr: null, push: null,
      warning: "F_push y dt_push deben ser números finitos.",
    };
  }
  if (F_push < 0 || dt_push < 0) {
    return {
      executed: false, atRest: null, a: null, N: null, Fr: null, push: null,
      warning: "F_push y dt_push deben ser >= 0.",
    };
  }

  const th = rad(theta_deg);
  const N = m * G * Math.cos(th);
  const slope = m * G * Math.sin(th);
  const pushing = F_push > 0 && dt_push > 0;
  const drive = slope + (pushing ? F_push : 0);

  if (drive <= mu_s * N) {
    // En reposo: el estático equilibra pendiente (+ empujón si lo hay).
    return {
      executed: true, atRest: true, a: 0, N, Fr: drive,
      push: pushing ? { F: F_push, dt: dt_push, unstuck: false, a_push: 0 } : null,
      warning: null,
    };
  }
  const a = G * (Math.sin(th) - mu_k * Math.cos(th));
  const Fr = mu_k * N;
  if (!pushing) {
    return { executed: true, atRest: false, a, N, Fr, push: null, warning: null };
  }
  const a_push = G * Math.sin(th) + F_push / m - mu_k * G * Math.cos(th);
  return {
    executed: true, atRest: false, a, N, Fr,
    push: { F: F_push, dt: dt_push, unstuck: true, a_push },
    warning: null,
  };
}

// Integración numérica con paso fijo DT (paso cinemático exacto, a constante
// por tramos). Soporta empujón opcional F_push (N) durante dt_push (s):
// a_push mientras t < dt_push, a permanente después. Si tras el empujón el peso
// no sostiene el movimiento, la fricción frena hasta v=0 (reason='rozamiento').
// L: longitud del plano (m). El bloque parte de arriba con v=0 y se detiene
// al llegar a la base (s=L) con choque inelástico.
export function simulateIncline({ m, theta_deg, mu_s, mu_k, L, tMax, F_push = 0, dt_push = 0 }) {
  const r = solveIncline({ m, theta_deg, mu_s, mu_k, F_push, dt_push });
  if (!r.executed) {
    return { executed: false, warning: r.warning, trajectory: [], final: null, steps: 0, dt: DT };
  }
  if (!isFiniteNumber(L) || !isFiniteNumber(tMax)) {
    return {
      executed: false, warning: "L y tMax deben ser números finitos.",
      trajectory: [], final: null, steps: 0, dt: DT,
    };
  }
  if (L <= 0 || tMax <= 0) {
    return {
      executed: false, warning: "L y tMax deben ser > 0.",
      trajectory: [], final: null, steps: 0, dt: DT,
    };
  }

  if (r.atRest) {
    const initial = { t: 0, s: 0, v: 0 };
    return {
      executed: true, warning: null, accel: r,
      params: { m, theta_deg, mu_s, mu_k, L, tMax, F_push, dt_push }, dt: DT,
      trajectory: [initial],
      final: { t: 0, s: 0, v: 0, stopped: true, reason: "reposo" },
      steps: 0,
    };
  }

  const pushing = !!(r.push && r.push.unstuck);
  const a_free = r.a;
  const a_push = pushing ? r.push.a_push : a_free;
  const trajectory = [{ t: 0, s: 0, v: 0 }];
  let t = 0, s = 0, v = 0;
  let stopped = false, reason = "tMax";

  while (t < tMax - 1e-12) {
    // Fase de empujón (t < dt_push) o fase libre. El paso sigue siendo
    // cinemáticamente exacto dentro de cada tramo de a constante.
    const a_cur = pushing && t < dt_push ? a_push : a_free;
    s += v * DT + 0.5 * a_cur * DT * DT;
    v += a_cur * DT;
    t += DT;
    t = Math.round(t / DT) * DT;
    if (s >= L) {
      s = L; v = 0; stopped = true; reason = "base";
      trajectory.push({ t, s, v });
      break;
    }
    if (v <= 0) {
      // El peso no sostiene el movimiento tras el empujón: la fricción
      // cinética frena hasta detener (sin retroceso ladera arriba).
      v = 0; stopped = true; reason = "rozamiento";
      trajectory.push({ t, s, v });
      break;
    }
    trajectory.push({ t, s, v });
  }
  if (!stopped) { reason = "tMax"; stopped = false; }

  return {
    executed: true, warning: null, accel: r,
    params: { m, theta_deg, mu_s, mu_k, L, tMax, F_push, dt_push }, dt: DT,
    trajectory,
    final: { t, s, v, stopped, reason },
    steps: trajectory.length - 1,
  };
}

// Solución analítica (a constante, parte del reposo): s = 0.5·a·t².
export function analyticalS(a, t) {
  return 0.5 * a * t * t;
}
