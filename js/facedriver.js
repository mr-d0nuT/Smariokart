/* ============================================================
 * Süper Mario Kart Web - FaceDriver (Selfie & Cara Personalizada)
 * Integra la cara del jugador (recortada con FaceCut o subida)
 * en los sprites del kart, minimapa, selección y podio al estilo SNES 16-bit.
 * ============================================================ */
'use strict';

const FaceDriver = (() => {
  let active = false;
  let userFaceCanvas = null;      // Lienzo 160x160 con la cara recortada
  let pilotName = 'MARIO';
  let charIdx = 0;               // 0 = Mario
  const customDriving = {};      // charIdx -> Array de 12 Canvas (32x32)
  let minimapIcon = null;        // Canvas 16x16
  let podiumFace = null;         // Canvas 48x48

  // Datos de cabezas/gorras por personaje (colores auténticos de la paleta SNES)
  const CHAR_THEMES = [
    { name: 'mario', capColor: '#d81818', capDark: '#880808', emblem: 'M', border: '#e82020' },
    { name: 'princess', capColor: '#f8d020', capDark: '#c89010', emblem: '👑', border: '#f8b8d8' },
    { name: 'bowser', capColor: '#40a020', capDark: '#185808', emblem: '⚡', border: '#e8c020' },
    { name: 'koopa', capColor: '#f0c020', capDark: '#20a030', emblem: '🐢', border: '#30c040' },
    { name: 'luigi', capColor: '#18a818', capDark: '#086808', emblem: 'L', border: '#20c020' },
    { name: 'yoshi', capColor: '#28c020', capDark: '#107010', emblem: '🥚', border: '#ff8830' },
    { name: 'dk', capColor: '#804018', capDark: '#482008', emblem: 'DK', border: '#d08030' },
    { name: 'toad', capColor: '#f8f8f8', capDark: '#d81818', emblem: '🍄', border: '#4080f8' }
  ];

  function init() {
    try {
      const saved = localStorage.getItem('smk_user_face');
      const savedName = localStorage.getItem('smk_pilot_name');
      const savedChar = localStorage.getItem('smk_pilot_char');
      if (saved) {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = c.height = 160;
          c.getContext('2d').drawImage(img, 0, 0);
          setFace(c, savedChar !== null ? parseInt(savedChar, 10) : 0, savedName || 'PILOTO', false);
        };
        img.src = saved;
      }
    } catch (e) {
      console.warn('FaceDriver: error al cargar cara guardada', e);
    }
  }

  /* Crea una versión pixelada retro de la cara (16-bit SNES) */
  function pixelateFace(srcCanvas, targetW, targetH) {
    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Reducción a resolución muy baja para efecto pixel art
    const low = document.createElement('canvas');
    low.width = targetW;
    low.height = targetH;
    const lctx = low.getContext('2d');
    lctx.imageSmoothingEnabled = true;
    lctx.drawImage(srcCanvas, 0, 0, targetW, targetH);

    // Contraste y saturación retro
    ctx.drawImage(low, 0, 0, targetW, targetH);

    // Máscara ovalada para eliminar cualquier resto de fondo
    const mask = document.createElement('canvas');
    mask.width = targetW;
    mask.height = targetH;
    const mctx = mask.getContext('2d');
    mctx.fillStyle = '#000';
    mctx.beginPath();
    mctx.ellipse(targetW / 2, targetH / 2, targetW * 0.44, targetH * 0.48, 0, 0, Math.PI * 2);
    mctx.fill();

    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    return out;
  }

  /* Genera los 12 cuadros de conducción del kart con la cara del jugador */
  function buildDrivingFrames(characterIndex) {
    const ch = CHARACTERS[characterIndex];
    const rawSheet = Assets.img(ch.file.replace('drivers/', ''));
    if (!rawSheet || !userFaceCanvas) return null;

    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];
    const frames = [];

    // Cara pixelada pequeña para el sprite 32x32 (13x13 píxeles)
    const pixFace = pixelateFace(userFaceCanvas, 14, 14);

    // Gorra/cabecera original del personaje (sacada del cuadro frontal o trasero)
    for (let f = 0; f < 12; f++) {
      const origSlice = Assets.slice(ch.file.replace('drivers/', ''), {
        x: 32 * f, y: 32, w: 32, h: 32
      });

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = 32;
      frameCanvas.height = 32;
      const fctx = frameCanvas.getContext('2d');
      fctx.imageSmoothingEnabled = false;

      // 1. Dibujar el kart original (cuerpo, ruedas, volante)
      fctx.drawImage(origSlice, 0, 0);

      // 2. Anclaje y ángulo de la cabeza según el fotograma
      // Fotogramas 0-4: trasero/giro leve/derrape; 5-7: perfil; 8-11: frontal/trompo
      let hx = 16, hy = 12, tilt = 0, scaleX = 1;
      if (f === 0) { hx = 16; hy = 12; tilt = 0; }
      else if (f === 1) { hx = 17; hy = 12; tilt = 0.08; }
      else if (f === 2) { hx = 17.5; hy = 12.5; tilt = 0.16; }
      else if (f === 3) { hx = 18; hy = 13; tilt = 0.24; }
      else if (f === 4) { hx = 18.5; hy = 13; tilt = 0.32; }
      else if (f === 5) { hx = 19; hy = 13; tilt = 0.15; scaleX = 0.9; }
      else if (f === 6) { hx = 19.5; hy = 13.5; tilt = 0.08; scaleX = 0.8; }
      else if (f === 7) { hx = 20; hy = 14; tilt = 0; scaleX = 0.75; } // lateral
      else if (f === 8) { hx = 18.5; hy = 13.5; tilt = -0.15; }
      else if (f === 9) { hx = 17.5; hy = 13; tilt = -0.10; }
      else if (f === 10) { hx = 16.5; hy = 12.5; tilt = -0.05; }
      else if (f === 11) { hx = 16; hy = 12; tilt = 0; } // frontal directo

      // 3. Borrar la cabeza original del sprite para sustituirla limpiamente
      fctx.save();
      fctx.beginPath();
      fctx.ellipse(hx, hy - 1, 7.5, 7.5, 0, 0, Math.PI * 2);
      fctx.clip();
      fctx.clearRect(0, 0, 32, 32);
      fctx.restore();

      // 4. Dibujar la cara pixelada del usuario
      fctx.save();
      fctx.translate(hx, hy);
      fctx.rotate(tilt);
      fctx.scale(scaleX, 1);
      // Cara centrada
      fctx.drawImage(pixFace, -7, -6, 14, 14);

      // Contorno fino estilo pixel SNES
      fctx.strokeStyle = 'rgba(10, 5, 0, 0.7)';
      fctx.lineWidth = 1;
      fctx.strokeRect(-6.5, -5.5, 13, 13);
      fctx.restore();

      // 5. Dibujar la gorra/sombrero del personaje encima de la frente
      fctx.save();
      fctx.translate(hx, hy - 6.5);
      fctx.rotate(tilt * 0.7);

      // Cúpula de la gorra
      fctx.fillStyle = theme.capColor;
      fctx.beginPath();
      fctx.ellipse(0, -1, 6.5, 3.5, 0, 0, Math.PI * 2);
      fctx.fill();

      // Visera / sombra
      fctx.fillStyle = theme.capDark;
      fctx.fillRect(-6, 0.5, 12, 1.8);

      // Emblema característico ('M', 'L', corona, etc.)
      fctx.fillStyle = '#ffffff';
      fctx.font = 'bold 5px sans-serif';
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      if (theme.emblem.length === 1 && theme.emblem !== '👑' && theme.emblem !== '⚡' && theme.emblem !== '🐢' && theme.emblem !== '🍄' && theme.emblem !== '🥚') {
        fctx.beginPath();
        fctx.arc(0, -1, 2.2, 0, Math.PI * 2);
        fctx.fill();
        fctx.fillStyle = theme.capColor;
        fctx.fillText(theme.emblem, 0, -1);
      } else if (characterIndex === 1) { // Corona Peach
        fctx.fillStyle = '#f8d020';
        fctx.beginPath();
        fctx.moveTo(-4, 0); fctx.lineTo(-4, -4); fctx.lineTo(-2, -1.5);
        fctx.lineTo(0, -4.5); fctx.lineTo(2, -1.5); fctx.lineTo(4, -4);
        fctx.lineTo(4, 0); fctx.closePath(); fctx.fill();
        fctx.fillStyle = '#e01010'; fctx.fillRect(-1, -1.5, 2, 1.5);
      } else if (characterIndex === 7) { // Seta Toad
        fctx.fillStyle = '#ffffff';
        fctx.beginPath(); fctx.ellipse(0, -2, 7, 4.5, 0, 0, Math.PI * 2); fctx.fill();
        fctx.fillStyle = '#d81818';
        fctx.beginPath(); fctx.arc(-3, -2, 1.8, 0, Math.PI * 2); fctx.fill();
        fctx.beginPath(); fctx.arc(3, -2, 1.8, 0, Math.PI * 2); fctx.fill();
        fctx.beginPath(); fctx.arc(0, -3.5, 1.8, 0, Math.PI * 2); fctx.fill();
      }
      fctx.restore();

      frames.push(frameCanvas);
    }

    return frames;
  }

  /* Crea icono pixelado de 16x16 para el minimapa */
  function buildMinimapIcon(characterIndex) {
    if (!userFaceCanvas) return null;
    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Fondo con color temático del personaje
    ctx.fillStyle = theme.border;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#000000';
    ctx.fillRect(1, 1, 14, 14);

    // Cara pixelada
    const pf = pixelateFace(userFaceCanvas, 12, 12);
    ctx.drawImage(pf, 2, 3, 12, 12);

    // Gorrita superior
    ctx.fillStyle = theme.capColor;
    ctx.fillRect(3, 1, 10, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 1, 2, 2);

    return c;
  }

  /* Crea icono para el podio / trofeo */
  function buildPodiumFace(characterIndex) {
    if (!userFaceCanvas) return null;
    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Borde retro
    ctx.fillStyle = '#f8d820';
    ctx.fillRect(0, 0, 48, 48);
    ctx.fillStyle = '#000';
    ctx.fillRect(2, 2, 44, 44);

    // Cara
    const pf = pixelateFace(userFaceCanvas, 38, 38);
    ctx.drawImage(pf, 5, 8, 38, 38);

    // Gorra grande
    ctx.fillStyle = theme.capColor;
    ctx.beginPath();
    ctx.ellipse(24, 8, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.capDark;
    ctx.fillRect(8, 11, 32, 4);

    return c;
  }

  /* Aplica la cara al juego y actualiza los frames del personaje */
  function setFace(canvas, cIdx = 0, name = 'PILOTO', persist = true) {
    userFaceCanvas = canvas;
    charIdx = cIdx;
    pilotName = (name || 'PILOTO').toUpperCase().slice(0, 8);
    active = true;

    // Reconstruir cuadros
    customDriving[charIdx] = buildDrivingFrames(charIdx);
    minimapIcon = buildMinimapIcon(charIdx);
    podiumFace = buildPodiumFace(charIdx);

    if (persist) {
      try {
        localStorage.setItem('smk_user_face', canvas.toDataURL('image/png'));
        localStorage.setItem('smk_pilot_name', pilotName);
        localStorage.setItem('smk_pilot_char', String(charIdx));
      } catch (e) {
        console.warn('FaceDriver: error al persistir en localStorage', e);
      }
    }

    // Actualizar nombre en CHARACTERS si corresponde
    if (CHARACTERS && CHARACTERS[charIdx]) {
      CHARACTERS[charIdx].customName = pilotName;
    }
  }

  function clearFace() {
    active = false;
    userFaceCanvas = null;
    customDriving[charIdx] = null;
    minimapIcon = null;
    podiumFace = null;
    try {
      localStorage.removeItem('smk_user_face');
      localStorage.removeItem('smk_pilot_name');
      localStorage.removeItem('smk_pilot_char');
    } catch (e) {}
  }

  /* Aplica los cuadros personalizados a un objeto Animator existente */
  function applyToAnimator(animator, characterIndex) {
    if (!active) return;
    if (!customDriving[characterIndex]) {
      customDriving[characterIndex] = buildDrivingFrames(characterIndex);
    }
    if (customDriving[characterIndex]) {
      animator.driving = customDriving[characterIndex];
      animator.hasCustomFace = true;
    }
  }

  return {
    init,
    setFace,
    clearFace,
    applyToAnimator,
    buildDrivingFrames,
    buildMinimapIcon,
    pixelateFace,
    get active() { return active; },
    get faceCanvas() { return userFaceCanvas; },
    get pilotName() { return pilotName; },
    get charIdx() { return charIdx; },
    get minimapIcon() { return minimapIcon; },
    get podiumFace() { return podiumFace; },
    get themes() { return CHAR_THEMES; }
  };
})();
