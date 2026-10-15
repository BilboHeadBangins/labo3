# Contexto de la sesión — Simuladores Labo 3 (Física I)

Fecha: octubre 2026. Carpeta: `Física I/simuladores/labo3/`.

## 1. Estructura actual

```
labo3/
  index.html        # Portada con tarjetas (Mesa+polea, Plano inclinado)
  sim-polea.html    # Simulación 1: dos masas, polea y rozamiento
  sim-plano.html    # Simulación 2: bloque en plano inclinado
  styles.css        # Estilos compartidos (pastel + cajas naranjas redondeadas)
  physics.js        # Física de la polea (G, DT, validateFriction, solveSystem, simulate, analyticalX)
  physics.test.js   # 10 tests (node:test nativo)
  incline.js        # Física del plano (solveIncline, simulateIncline, analyticalS; reutiliza G, DT, validateFriction)
  incline.test.js   # 9 tests (node:test nativo)
  package.json      # type:module, script test = node --test
  CONTEXTO.md       # Este archivo
```

Abrir con servidor local (`python3 -m http.server` en `labo3/` → `http://localhost:8000/`),
porque las páginas importan sus `.js` como ES modules (no funciona con doble clic `file://`).
Frenar el servidor: `Ctrl+C` en su terminal; si quedó en segundo plano: `kill %1`;
si se perdió la terminal: `lsof -ti:8000 | xargs kill` o `pkill -f "http.server"`.

## 2. Simulación 1 — Mesa + polea (`physics.js` + `sim-polea.html`)

- m₁ sobre mesa horizontal con rozamiento, m₂ colgando, cuerda ideal, polea sin masa, g = 9.8.
- Reposo si `m₂·g ≤ μs·m₁·g` → `a=0, T=m₂·g, Fr=m₂·g`.
- Si no → `a=(m₂·g−μk·m₁·g)/(m₁+m₂)`, `T=m₁·(a+μk·g)`, `Fr=μk·m₁·g`.
- Integración paso fijo `DT=0.005` (paso cinemático exacto por tramos). Mesa finita:
  paradas `borde` / `suelo` / `ambos` / `reposo` / `tMax` (+ `rozamiento`, ver §4).
- Restricción física: `μk ≤ μs`. Si se viola, NO se ejecuta: `{executed:false, warning}`
  (sin `throw`, opción más liviana elegida por el usuario).
- Caso ancla verificado: `m1=5, m2=2.5, μk≈0.41` → `a≈0.59, T≈23.03`.
- Página: canvas (mesa gris, bloque m₁ amarillo, polea, cuerda, esfera m₂ azul;
  vectores T azul, Fr rojo, P₂ rosa, longitudes ∝ valor), lecturas x/y (m),
  cronómetro digital `mm:ss.mmm`, controles Play/Pausa/Reiniciar/Paso +0.05 s,
  selector de velocidad, panel de parámetros con preset ancla.

## 3. Simulación 2 — Plano inclinado (`incline.js` + `sim-plano.html`)

- Bloque solo deslizándose. Reposo si `tanθ ≤ μs` → `a=0, Fr=m·g·sinθ, N=m·g·cosθ`;
  si no → `a=g·(sinθ−μk·cosθ)`, `Fr=μk·N`.
- Casos borde: `θ=0°` reposo, `θ=90°` caída libre (`a=g, N=Fr=0`).
- Integración igual que la polea; paradas `base` / `tMax` / `reposo` (+ `rozamiento`, §5).
- Página: triángulo gris con arco θ, bloque amarillo, vectores P rosa, N azul,
  Fr rojo; mismos controles y cronómetro; lecturas `s, v, a, N, Fr`.
- Fix de dibujo aplicado: el bloque rotaba con signo invertido (`rotate(-th)` → `rotate(th)`)
  y medio bloque colgaba del ápice; ahora se dibuja con offset visual de medio lado
  (`s·pxPerM + B/2` acotado) — cara inferior paralela y pegada en 0°–90°.

## 4. Empujón en la polea (F durante Δt, hacia la polea)

- `solveSystem`/`simulate` aceptan `F_push` (N), `dt_push` (s); defecto 0 = clásico intacto.
- Despegue solo si `m₂·g + F > μs·m₁·g`; si no, reposo con `Fr = m₂·g + F`.
- En marcha: `a_push=(m₂·g+F−μk·m₁·g)/(m₁+m₂)` durante Δt, luego `a` permanente
  (`T_push = m₂·(g−a_push)`).
- Nuevo motivo de parada `rozamiento` (frena hasta `v=0` sin retroceder).
  Inválidos (`F<0`, `Δt<0`) → `executed:false + warning`.
- Página: inputs F/Δt, botón "💪 Empuje pequeño" (5 N × 0.2 s), flecha verde F,
  lecturas a/T según fase.

## 5. Empujón en el plano (F durante Δt, ladera abajo)

- Decisión del usuario: solo ladera abajo (espejo de la polea).
- `solveIncline`/`simulateIncline` aceptan `F_push`/`dt_push`; defecto 0 = clásico intacto.
- Despegue solo si `m·g·sinθ + F > μs·N`; si no, reposo con `Fr = m·g·sinθ + F`.
- En marcha: `a_push = g·sinθ + F/m − μk·g·cosθ` durante Δt, luego `a`
  (N y Fr iguales en ambas fases). Parada `rozamiento` análoga.
- Página: mismos inputs/botón/flecha verde (dirección ladera abajo) que la polea;
  solo la lectura `a` es sensible a la fase.

## 6. Decisiones de diseño vigentes

- ES Modules puros, `node:test` nativo, cero dependencias.
- Validación liviana: retornos `{executed:false, warning}`, nunca excepciones.
- `index.html` es portada; cada simulación en su `sim-*.html` (+ su módulo y test).
  Para una futura simulación: duplicar tarjeta en portada + página + módulo + test.
- `styles.css` compartido por las 3 páginas.

## 7. Tests (19 en verde con `node --test`)

- Polea (10): reposo, umbral, sin rozamiento, ancla (a≈0.59, T≈23.03), rozamiento genérico
  + equivalencia T, integración (DT, analítica, borde, suelo, reposo), μk>μs,
  empuje insuficiente, empuje+despegue+frenado, empuje en marcha+regresión+inválidos.
- Plano (9): reposo, umbral (θ=45°, μs=1 — igualdad exacta en flotantes),
  sin rozamiento (a=4.9), calculado (a≈3.20), caída libre, integración
  (DT, analítica, base, reposo, μk>μs, θ inválido), empuje insuficiente,
  empuje+despegue+frenado, empuje en marcha+regresión+inválidos.

## 8. Sesión octubre 2026 — Deploy a GitHub Pages

- Decisión: repo `BilboHeadBangins/labo3` (nombre corto, proyecto inicial),
  root web = contenido de `labo3/`, hosting GitHub Pages, subdominio gratis
  `bilboheadbangins.github.io/labo3`. Uso principal: celular → Agregar a pantalla principal.
- Remote ya existía vacío (1 commit LICENSE GPL-3.0 `47904d2`);
  local `git init -b main`, commit `3edafea` + rebase + push.
- Agregados: `.github/workflows/pages.yml` (Static HTML, deploy auto en push a main),
  `README.md` (URL + uso celu + dev local), `.gitignore` (node_modules), `404.html`.
- Retoques móvil sin tocar física: `inputmode="decimal"` en inputs numéricos,
  `button{touch-action:manipulation}`, `@media 600px canvas 340px`,
  `meta description` + favicon emoji inline en las 3 páginas.
- Pages activado vía `gh api POST repos/.../pages {build_type: workflow}`;
  run Deploy OK en ~16s. Tests 19/19 verde antes y después.
- URLs vivas: `https://bilboheadbangins.github.io/labo3/` (oficial, en README)
  y alias automático `https://ilechma.me/labo3/` — el dominio estudiante viene
  de la cuenta, no lo configuramos en este repo (`cname:null`);
  no bloquea otros proyectos (`/otro-proyecto/` convive).
- Discutido sin implementar: tests validan consistencia interna vs teoría,
  no contra experimento real; pendiente capa de invariantes (energía, cotas)
  y/o protocolo de comparación con mediciones del labo.
