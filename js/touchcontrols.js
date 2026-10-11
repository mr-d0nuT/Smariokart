/* ============================================================
 * Süper Mario Kart Web - TouchControls (Controles Táctiles Móviles / Tablet)
 * Sistema de control analógico virtual y botonera arcade hiperprofesional:
 * - Joystick analógico flotante y ergonómico para pulgar izquierdo.
 * - Botonera táctil estilo diamante SNES arcade para pulgar derecho:
 *   [GAS], [SALTO/DERRAPE], [ITEM], [FRENO], [START/PAUSA].
 * - Soporte multi-touch sin interferencias con Pointer Events.
 * - Vibración háptica, prevención de zoom/scroll y estética retro translúcida.
 * ============================================================ */
'use strict';

const TouchControls = (() => {
  let active = false;
  let joyActive = false;
  let joyPointerId = null;
  let joyOrigin = { x: 0, y: 0 };
  const JOY_RADIUS = 46;

  let elRoot = null;
  let elJoyBase = null;
  let elJoyKnob = null;

  function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isSmall = window.innerWidth <= 820;
    return (hasTouch && isCoarse) || (hasTouch && isSmall);
  }

  function vibrate(ms = 12) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch (e) {}
  }

  function init() {
    if (typeof document === 'undefined') return;

    if (isTouchDevice()) {
      document.body.classList.add('has-touch-controls');
      createUI();
    } else {
      const onFirstTouch = () => {
        document.body.classList.add('has-touch-controls');
        createUI();
        window.removeEventListener('touchstart', onFirstTouch);
      };
      window.addEventListener('touchstart', onFirstTouch, { passive: true, once: true });
    }
  }

  function createUI() {
    if (elRoot) return;

    elRoot = document.createElement('div');
    elRoot.id = 'mobileControls';
    elRoot.className = 'mobile-controls';
    elRoot.innerHTML = `
      <!-- Zona Izquierda: Joystick Virtual -->
      <div id="touchZoneLeft" class="touch-zone-left">
        <div id="touchJoyBase" class="touch-joy-base">
          <div class="joy-guide joy-guide-u">▲</div>
          <div class="joy-guide joy-guide-d">▼</div>
          <div class="joy-guide joy-guide-l">◀</div>
          <div class="joy-guide joy-guide-r">▶</div>
          <div id="touchJoyKnob" class="touch-joy-knob"></div>
        </div>
      </div>

      <!-- Zona Central: Botón Start / Menú -->
      <div class="touch-zone-center">
        <button id="btnTouchStart" type="button" class="touch-btn-pill" data-action="accept">START</button>
      </div>

      <!-- Zona Derecha: Botonera Arcade Diamante SNES -->
      <div id="touchZoneRight" class="touch-zone-right">
        <!-- ITEM (Arriba Izquierda) -->
        <button id="btnTouchItem" type="button" class="touch-btn btn-item" data-action="item" title="Usar Objeto">
          <span class="btn-lbl">ITEM</span>
          <span class="btn-sub">⚡</span>
        </button>

        <!-- SALTO / DERRAPE (Arriba Derecha) -->
        <button id="btnTouchDrift" type="button" class="touch-btn btn-drift" data-action="drift" title="Salto y Derrape">
          <span class="btn-lbl">SALTO</span>
          <span class="btn-sub">DERRAPE</span>
        </button>

        <!-- FRENO (Abajo Izquierda) -->
        <button id="btnTouchBrake" type="button" class="touch-btn btn-brake" data-action="brake" title="Freno / Marcha Atrás">
          <span class="btn-lbl">FRENO</span>
          <span class="btn-sub">B</span>
        </button>

        <!-- GAS (Abajo Derecha - Principal Grande) -->
        <button id="btnTouchGas" type="button" class="touch-btn btn-gas" data-action="accel" title="Acelerar">
          <span class="btn-lbl">GAS</span>
          <span class="btn-sub">A</span>
        </button>
      </div>
    `;

    document.body.appendChild(elRoot);

    elJoyBase = document.getElementById('touchJoyBase');
    elJoyKnob = document.getElementById('touchJoyKnob');
    const leftZone = document.getElementById('touchZoneLeft');

    // Manejo del Joystick Analógico Virtual con Pointer Events
    if (leftZone) {
      leftZone.addEventListener('pointerdown', onJoyStart, { passive: false });
      window.addEventListener('pointermove', onJoyMove, { passive: false });
      window.addEventListener('pointerup', onJoyEnd, { passive: false });
      window.addEventListener('pointercancel', onJoyEnd, { passive: false });
      leftZone.addEventListener('lostpointercapture', onJoyEnd, { passive: false });
    }

    // Manejo de los Botones de Acción Táctiles
    const buttons = elRoot.querySelectorAll('.touch-btn, .touch-btn-pill');
    buttons.forEach(btn => {
      const action = btn.getAttribute('data-action');
      if (!action) return;

      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        btn.classList.add('active');
        vibrate(10);
        if (typeof Input !== 'undefined') {
          Input.setVirtualButton(action, true);
        }
        if (typeof Sound !== 'undefined') {
          Sound.init();
          Sound.resume();
        }
      };

      const release = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
        btn.classList.remove('active');
        if (typeof Input !== 'undefined') {
          Input.setVirtualButton(action, false);
        }
      };

      btn.addEventListener('pointerdown', press, { passive: false });
      btn.addEventListener('pointerup', release, { passive: false });
      btn.addEventListener('pointercancel', release, { passive: false });
      btn.addEventListener('lostpointercapture', release, { passive: false });
    });

    active = true;
  }

  function onJoyStart(e) {
    if (joyActive) return;
    joyActive = true;
    joyPointerId = e.pointerId;
    const leftZone = document.getElementById('touchZoneLeft');
    if (leftZone) {
      try { leftZone.setPointerCapture(e.pointerId); } catch (err) {}
    }

    const rect = elJoyBase.getBoundingClientRect();
    joyOrigin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    vibrate(8);
    onJoyMove(e);
  }

  function onJoyMove(e) {
    if (!joyActive || e.pointerId !== joyPointerId) return;
    e.preventDefault();

    const dx = e.clientX - joyOrigin.x;
    const dy = e.clientY - joyOrigin.y;
    const dist = Math.hypot(dx, dy);

    const angle = Math.atan2(dy, dx);
    const clampedDist = Math.min(dist, JOY_RADIUS);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    if (elJoyKnob) {
      elJoyKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    }

    // Coordenadas normalizadas [-1, 1]
    const nx = clampedDist > 0 ? (knobX / JOY_RADIUS) : 0;
    const ny = clampedDist > 0 ? (knobY / JOY_RADIUS) : 0;

    if (typeof Input !== 'undefined') {
      // Giro horizontal
      Input.setVirtualButton('left', nx < -0.22);
      Input.setVirtualButton('right', nx > 0.22);

      // Movimiento vertical (en carrera: ↑ accel / ↓ brake; en menús: navegar)
      Input.setVirtualButton('up', ny < -0.32);
      Input.setVirtualButton('down', ny > 0.32);
    }
  }

  function onJoyEnd(e) {
    if (!joyActive || (e && e.pointerId !== joyPointerId)) return;
    const pId = joyPointerId;
    joyActive = false;
    joyPointerId = null;

    const leftZone = document.getElementById('touchZoneLeft');
    if (leftZone && pId !== null) {
      try { leftZone.releasePointerCapture(pId); } catch (err) {}
    }

    if (elJoyKnob) {
      elJoyKnob.style.transform = 'translate(0px, 0px)';
    }

    if (typeof Input !== 'undefined') {
      Input.setVirtualButton('left', false);
      Input.setVirtualButton('right', false);
      Input.setVirtualButton('up', false);
      Input.setVirtualButton('down', false);
    }
  }

  return {
    init,
    isTouchDevice,
    get active() { return active; }
  };
})();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TouchControls.init());
  } else {
    TouchControls.init();
  }
}
