// Núcleo física: dos masas unidas por cuerda ideal sobre polea sin masa.
// m1 sobre mesa horizontal con rozamiento, m2 colgando.
// Convención: v >= 0 = m1 hacia la polea, m2 hacia abajo.
// x = distancia recorrida desde el inicio, y = altura de m2 (y(0) = h0).

export const G = 9.8;
export const DT = 0.005;

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

function baseWarning(prefix) {
  return prefix;
}

// Validación liviana: no lanza, no aloca trayectorias. Retorna objeto pequeño.
export function validateFriction(mu_s, mu_k) {
  if (!isFiniteNumber(mu_s) || !isFiniteNumber(mu_k)) {
    return {
      ok: false,
      warning: baseWarning("mu_s y mu_k deben ser números finitos."),
    };
  }
  if (mu_s < 0 || mu_k < 0) {
    return {
      ok: false,
      warning: baseWarning("mu_s y mu_k deben ser >= 0."),
    };
  }
  if (mu_k > mu_s) {
    return {
      ok: false,
      warning:
        `mu_k (${mu_k}) no puede ser mayor que mu_s (${mu_s}). ` +
        `Ajusta los coeficientes (mu_k <= mu_s) para ejecutar la simulación.`,
    };
  }
  return { ok: true, warning: null };
}

function validateMasses(m1, m2) {
  if (!isFiniteNumber(m1) || !isFiniteNumber(m2)) {
    return { ok: false, warning: "m1 y m2 deben ser números finitos." };
  }
  if (m1 <= 0 || m2 <= 0) {
    return { ok: false, warning: "m1 y m2 deben ser > 0." };
  }
  return { ok: true, warning: null };
}

// Resuelve el estado dinámico (aceleración, tensión, rozamiento).
// Soporta empujón opcional: F_push (N, hacia la polea) durante dt_push (s).
// El empujón suma a m2*g para vencer al rozamiento estático; una vez en
// marcha, durante el empujón a_push=(m2*g+F-mu_k*m1*g)/(m1+m2) y después
// el a permanente habitual. Con F_push=0 o dt_push=0 el resultado es idéntico al clásico.
// Ante parámetros inválidos NO lanza: retorna { executed:false, warning }.
export function solveSystem({ m1, m2, mu_s, mu_k, F_push = 0, dt_push = 0 }) {
  const vm = validateMasses(m1, m2);
  if (!vm.ok) {
    return {
      executed: false,
      atRest: null,
      a: null,
      T: null,
      Fr: null,
      warning: vm.warning,
    };
  }
  const vf = validateFriction(mu_s, mu_k);
  if (!vf.ok) {
    return {
      executed: false,
      atRest: null,
      a: null,
      T: null,
      Fr: null,
      push: null,
      warning: vf.warning,
    };
  }
  if (!isFiniteNumber(F_push) || !isFiniteNumber(dt_push)) {
    return {
      executed: false,
      atRest: null,
      a: null,
      T: null,
      T_push: null,
      Fr: null,
      push: null,
      warning: "F_push y dt_push deben ser números finitos.",
    };
  }
  if (F_push < 0 || dt_push < 0) {
    return {
      executed: false,
      atRest: null,
      a: null,
      T: null,
      T_push: null,
      Fr: null,
      push: null,
      warning: "F_push y dt_push deben ser >= 0.",
    };
  }

  const pushing = F_push > 0 && dt_push > 0;

  if (!pushing && m2 * G <= mu_s * m1 * G) {
    return {
      executed: true,
      atRest: true,
      a: 0,
      T: m2 * G,
      T_push: null,
      Fr: m2 * G,
      push: null,
      warning: null,
    };
  }

  if (!pushing) {
    const a = (m2 * G - mu_k * m1 * G) / (m1 + m2);
    const T = m1 * (a + mu_k * G);
    const Fr = mu_k * m1 * G;
    return { executed: true, atRest: false, a, T, T_push: null, Fr, push: null, warning: null };
  }

  // Con empujón: el estático debe vencer a m2*g + F_push.
  const drive = m2 * G + F_push;
  if (drive <= mu_s * m1 * G) {
    // El estático absorbe el empujón: T=m2*g (equilibrio de m2),
    // Fr equilibra a m1 (T + F_push).
    return {
      executed: true,
      atRest: true,
      a: 0,
      T: m2 * G,
      T_push: null,
      Fr: drive,
      push: { F: F_push, dt: dt_push, unstuck: false, a_push: 0, T_push: null },
      warning: null,
    };
  }

  const a = (m2 * G - mu_k * m1 * G) / (m1 + m2);
  const T = m1 * (a + mu_k * G);
  const Fr = mu_k * m1 * G;
  const a_push = (drive - mu_k * m1 * G) / (m1 + m2);
  const T_push = m2 * (G - a_push);
  return {
    executed: true,
    atRest: false,
    a,
    T,
    T_push,
    Fr,
    push: { F: F_push, dt: dt_push, unstuck: true, a_push, T_push },
    warning: null,
  };
}

// Integración numérica con paso fijo DT (paso cinemático exacto para a constante
// por tramos). Soporta empujón opcional F_push (N) durante dt_push (s):
// a_push mientras t < dt_push, a permanente después. Si tras el empujón el peso
// no sostiene el movimiento, la fricción frena hasta v=0 (reason='rozamiento').
// x0: distancia inicial de m1 al borde. h0: altura inicial de m2 al suelo.
// Ante mu_k > mu_s (o params inválidos): no integra, retorna aviso.
export function simulate({ m1, m2, mu_s, mu_k, x0, h0, tMax, F_push = 0, dt_push = 0 }) {
  const vm = validateMasses(m1, m2);
  if (!vm.ok) {
    return {
      executed: false,
      warning: vm.warning,
      trajectory: [],
      final: null,
      steps: 0,
      dt: DT,
    };
  }
  const vf = validateFriction(mu_s, mu_k);
  if (!vf.ok) {
    return {
      executed: false,
      warning: vf.warning,
      trajectory: [],
      final: null,
      steps: 0,
      dt: DT,
    };
  }
  if (!isFiniteNumber(x0) || !isFiniteNumber(h0) || !isFiniteNumber(tMax)) {
    return {
      executed: false,
      warning: "x0, h0 y tMax deben ser números finitos.",
      trajectory: [],
      final: null,
      steps: 0,
      dt: DT,
    };
  }
  if (x0 <= 0 || h0 <= 0 || tMax <= 0) {
    return {
      executed: false,
      warning: "x0, h0 y tMax deben ser > 0.",
      trajectory: [],
      final: null,
      steps: 0,
      dt: DT,
    };
  }

  const accel = solveSystem({ m1, m2, mu_s, mu_k, F_push, dt_push });
  // solveSystem ya validó; si algo falló, propagar aviso sin integrar.
  if (!accel.executed) {
    return {
      executed: false,
      warning: accel.warning,
      trajectory: [],
      final: null,
      steps: 0,
      dt: DT,
    };
  }

  // Caso en reposo: sin movimiento, trayectoria de 1 punto (barata).
  // (Incluye empujón insuficiente: el estático lo absorbe.)
  if (accel.atRest) {
    const initial = { t: 0, x: 0, v: 0, y: h0 };
    return {
      executed: true,
      warning: null,
      accel,
      params: { m1, m2, mu_s, mu_k, x0, h0, tMax, F_push, dt_push },
      dt: DT,
      trajectory: [initial],
      final: { t: 0, x: 0, v: 0, y: h0, stopped: true, reason: "reposo" },
      steps: 0,
    };
  }

  const pushing = !!(accel.push && accel.push.unstuck);
  const a_free = accel.a;
  const a_push = pushing ? accel.push.a_push : a_free;
  const trajectory = [{ t: 0, x: 0, v: 0, y: h0 }];
  let t = 0;
  let x = 0;
  let v = 0;

  // Tope físico real: el sistema se detiene en el primer contacto,
  // es decir al alcanzar min(x0, h0).
  const xStop = Math.min(x0, h0);

  let stopped = false;
  let reason = "tMax";

  while (t < tMax - 1e-12) {
    // Fase de empujón (t < dt_push) o fase libre. El paso sigue siendo
    // cinemáticamente exacto dentro de cada tramo de a constante.
    const a_cur = pushing && t < dt_push ? a_push : a_free;
    x += v * DT + 0.5 * a_cur * DT * DT;
    v += a_cur * DT;
    t += DT;
    // Corrección de deriva flotante en t.
    t = Math.round(t / DT) * DT;

    if (x >= xStop) {
      x = xStop;
      v = 0;
      stopped = true;
      if (x0 < h0) reason = "borde";
      else if (h0 < x0) reason = "suelo";
      else reason = "ambos";
      trajectory.push({ t, x, v, y: h0 - x });
      break;
    }
    if (v <= 0) {
      // El peso no sostiene el movimiento tras el empujón: la fricción
      // cinética frena hasta detener (sin retroceso: la cuerda se aflojaría).
      v = 0;
      stopped = true;
      reason = "rozamiento";
      trajectory.push({ t, x, v, y: h0 - x });
      break;
    }
    trajectory.push({ t, x, v, y: h0 - x });
  }

  if (!stopped) {
    reason = "tMax";
    stopped = false;
  }

  return {
    executed: true,
    warning: null,
    accel,
    params: { m1, m2, mu_s, mu_k, x0, h0, tMax, F_push, dt_push },
    dt: DT,
    trajectory,
    final: { t, x, v, y: h0 - x, stopped, reason },
    steps: trajectory.length - 1,
  };
}

// Solución analítica (a constante, parte del reposo): x = 0.5*a*t^2.
// Solo para validar el error numérico en tests.
export function analyticalX(a, t) {
  return 0.5 * a * t * t;
}
