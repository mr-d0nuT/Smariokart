/* ============================================================
 * Süper Mario Kart Web - FaceDriver (Selfie & Cara Personalizada)
 * Integra la cara del jugador (frontal y nuca/por detrás)
 * con MÁXIMA CALIDAD FOTOGRÁFICA (sin pixelar/cuadricular)
 * y con TAMAÑO EXAGERADO (Modo Cabezón / Big Head Arcade).
 * ============================================================ */
'use strict';

const FaceDriver = (() => {
  let active = false;
  let userFaceCanvas = null;      // Lienzo alta resolución con la cara frontal recortada
  let userBackCanvas = null;      // Lienzo alta resolución con la nuca/pelo por detrás
  let pilotName = 'MARIO';
  let charIdx = 0;               // 0 = Mario
  const customDriving = {};      // charIdx -> Array de 12 Canvas (128x128 alta definición)
  let minimapIcon = null;        // Canvas 48x48 alta definición
  let podiumFace = null;         // Canvas 128x128 alta definición

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
      const savedFace = localStorage.getItem('smk_user_face');
      const savedBack = localStorage.getItem('smk_user_back');
      const savedName = localStorage.getItem('smk_pilot_name');
      const savedChar = localStorage.getItem('smk_pilot_char');
      if (savedFace) {
        const imgFace = new Image();
        imgFace.onload = () => {
          const cFace = document.createElement('canvas');
          cFace.width = imgFace.width; cFace.height = imgFace.height;
          cFace.getContext('2d').drawImage(imgFace, 0, 0);

          if (savedBack) {
            const imgBack = new Image();
            imgBack.onload = () => {
              const cBack = document.createElement('canvas');
              cBack.width = imgBack.width; cBack.height = imgBack.height;
              cBack.getContext('2d').drawImage(imgBack, 0, 0);
              setFace(cFace, cBack, savedChar !== null ? parseInt(savedChar, 10) : 0, savedName || 'PILOTO', false);
            };
            imgBack.src = savedBack;
          } else {
            setFace(cFace, null, savedChar !== null ? parseInt(savedChar, 10) : 0, savedName || 'PILOTO', false);
          }
        };
        imgFace.src = savedFace;
      }
    } catch (e) {
      console.warn('FaceDriver: error al cargar fotos guardadas', e);
    }
  }

  /* Genera los 12 cuadros de conducción del kart con máxima fidelidad retro al juego original:
   * - Vistas traseras (0..4): si no hay foto de nuca, 100% sprite original de Nintendo;
   *   si hay foto de nuca, se integra limpia bajo la gorra original.
   * - Vistas de perfil (5..7): 100% sprite 3D original de Nintendo (laterales auténticos).
   * - Vistas frontales (8..11): foto frontal recortada en el rostro con la gorra y visera
   *   auténtica de Nintendo (filas 0..11) redibujada directamente encima y el chasis
   *   original del kart (filas 20..32) intacto abajo. */
  function buildDrivingFrames(characterIndex) {
    const ch = (typeof CHARACTERS !== 'undefined' && CHARACTERS[characterIndex]) ? CHARACTERS[characterIndex] : null;
    if (!ch) return null;
    const driverName = ch.file.replace('drivers/', '');
    const rawSheet = Assets.img(driverName);
    if (!rawSheet || !userFaceCanvas) return null;

    const frames = [];
    const SPRITE_SIZE = 128; // 4x sobre los 32x32 de SNES para nitidez cristalina

    for (let f = 0; f < 12; f++) {
      const origSlice = Assets.slice(driverName, {
        x: 32 * f, y: 32, w: 32, h: 32
      });

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = SPRITE_SIZE;
      frameCanvas.height = SPRITE_SIZE;
      const fctx = frameCanvas.getContext('2d');

      // 1. Dibujar el sprite 100% original de Nintendo escalado 4x manteniendo nitidez pixel-art perfecta
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(origSlice, 0, 0, 32, 32, 0, 0, SPRITE_SIZE, SPRITE_SIZE);

      // 2. Si es vista trasera (0 a 4):
      if (f >= 0 && f <= 4) {
        if (userBackCanvas) {
          // Si el usuario proporcionó foto de nuca, se integra bajo la gorra original
          const bx = 64 + (f * 2.5);
          const by = 48;
          fctx.save();
          fctx.imageSmoothingEnabled = true;
          fctx.imageSmoothingQuality = 'high';
          fctx.beginPath();
          fctx.ellipse(bx, by, 18, 16, 0, 0, Math.PI * 2);
          fctx.clip();
          fctx.drawImage(userBackCanvas, bx - 18, by - 16, 36, 32);
          fctx.restore();

          // Redibujar la gorra auténtica de Nintendo por encima
          fctx.imageSmoothingEnabled = false;
          fctx.drawImage(origSlice, 0, 0, 32, 11, 0, 0, 128, 44);
        }
        // Si NO hay foto trasera: 100% sprite original de Nintendo, sin modificaciones
      }
      // 3. Si son vistas de perfil/laterales (5 a 7):
      else if (f >= 5 && f <= 7) {
        // Lateral 100% original de Nintendo tal como en el juego original
      }
      // 4. Si son vistas frontales (8 a 11):
      else {
        // Encarando a la cámara: aquí va el selfie frontal ampliado (Modo Cabezón Arcade)
        let cx = 64, cy = 54, fw = 76, fh = 68;
        if (f === 11) { cx = 64; cy = 54; fw = 76; fh = 68; } // Frontal directo
        else if (f === 10) { cx = 66; cy = 54; fw = 74; fh = 68; }
        else if (f === 9) { cx = 68; cy = 54; fw = 72; fh = 68; }
        else if (f === 8) { cx = 70; cy = 54; fw = 70; fh = 68; }

        // Borrar el rostro original del personaje para que no se superponga por debajo
        fctx.clearRect(28, 32, 72, 48);

        // Dibujar el selfie con recorte suave en el óvalo de la cara
        fctx.save();
        fctx.imageSmoothingEnabled = true;
        fctx.imageSmoothingQuality = 'high';
        fctx.beginPath();
        fctx.ellipse(cx, cy, fw / 2, fh / 2, 0, 0, Math.PI * 2);
        fctx.clip();
        fctx.drawImage(userFaceCanvas, cx - fw / 2, cy - fh / 2, fw, fh);
        fctx.restore();

        // REDIBUJAR LA GORRA AUTÉNTICA DE NINTENDO (filas 0 a 11) DIRECTAMENTE ENCIMA
        // Esto coloca la visera real y el emblema de Nintendo en la frente del jugador
        fctx.imageSmoothingEnabled = false;
        fctx.drawImage(origSlice, 0, 0, 32, 11, 0, 0, 128, 44);

        // REDIBUJAR EL VOLANTE, MANOS Y CHASIS DEL KART (filas 20 a 32)
        fctx.drawImage(origSlice, 0, 20, 32, 12, 0, 80, 128, 48);
      }

      frames.push(frameCanvas);
    }

    return frames;
  }

  /* Crea icono en alta definición de 48x48 para el minimapa */
  function buildMinimapIcon(characterIndex) {
    if (!userFaceCanvas) return null;
    const ch = (typeof CHARACTERS !== 'undefined' && CHARACTERS[characterIndex]) ? CHARACTERS[characterIndex] : { file: 'mario' };
    const driverName = ch.file.replace('drivers/', '');
    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];

    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const ctx = c.getContext('2d');

    // Fondo circular con color temático del personaje
    ctx.fillStyle = theme.border || '#e82020';
    ctx.beginPath(); ctx.arc(24, 24, 23, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#080814';
    ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.fill();

    // Sprite frontal original del personaje a 48x48
    const origSlice = Assets.slice(driverName, { x: 32 * 11, y: 32, w: 32, h: 32 });

    ctx.save();
    ctx.beginPath(); ctx.arc(24, 24, 18, 0, Math.PI * 2); ctx.clip();

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(origSlice, 0, 0, 32, 32, 4, 4, 40, 40);

    // Borrar cara original
    ctx.clearRect(10, 14, 28, 20);

    // Integrar el selfie en el área de la cara
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(userFaceCanvas, 10, 14, 28, 24);

    // Gorra auténtica de Nintendo por encima
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(origSlice, 0, 0, 32, 11, 4, 4, 40, 14);

    ctx.restore();

    return c;
  }

  /* Crea icono en alta definición para el podio / trofeo */
  function buildPodiumFace(characterIndex) {
    if (!userFaceCanvas) return null;
    const ch = (typeof CHARACTERS !== 'undefined' && CHARACTERS[characterIndex]) ? CHARACTERS[characterIndex] : { file: 'mario' };
    const driverName = ch.file.replace('drivers/', '');

    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');

    // Borde dorado de trofeo
    ctx.fillStyle = '#f8d820';
    ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#101018';
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();

    // Sprite frontal original del personaje escalado
    const origSlice = Assets.slice(driverName, { x: 32 * 11, y: 32, w: 32, h: 32 });

    ctx.save();
    ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.clip();

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(origSlice, 0, 0, 32, 32, 12, 12, 104, 104);

    // Borrar cara original
    ctx.clearRect(28, 34, 72, 48);

    // Integrar la cara con el recorte oval suave
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(userFaceCanvas, 28, 34, 72, 64);

    // Gorra auténtica de Nintendo por encima
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(origSlice, 0, 0, 32, 11, 12, 12, 104, 36);

    ctx.restore();

    return c;
  }

  /* Aplica las fotos (frontal + trasera opcional) al juego */
  function setFace(frontCanvas, backCanvas = null, cIdx = 0, name = 'PILOTO', persist = true) {
    userFaceCanvas = frontCanvas;
    userBackCanvas = backCanvas;
    charIdx = cIdx;
    pilotName = (name || 'PILOTO').toUpperCase().slice(0, 8);
    active = true;

    // Reconstruir cuadros en alta calidad
    customDriving[charIdx] = buildDrivingFrames(charIdx);
    minimapIcon = buildMinimapIcon(charIdx);
    podiumFace = buildPodiumFace(charIdx);

    if (persist) {
      try {
        if (frontCanvas) localStorage.setItem('smk_user_face', frontCanvas.toDataURL('image/png'));
        if (backCanvas) localStorage.setItem('smk_user_back', backCanvas.toDataURL('image/png'));
        else localStorage.removeItem('smk_user_back');
        localStorage.setItem('smk_pilot_name', pilotName);
        localStorage.setItem('smk_pilot_char', String(charIdx));
      } catch (e) {
        console.warn('FaceDriver: error al persistir en localStorage', e);
      }
    }

    // Actualizar nombre en CHARACTERS si corresponde
    if (typeof CHARACTERS !== 'undefined' && CHARACTERS[charIdx]) {
      CHARACTERS[charIdx].customName = pilotName;
    }
  }

  function clearFace() {
    active = false;
    userFaceCanvas = null;
    userBackCanvas = null;
    customDriving[charIdx] = null;
    minimapIcon = null;
    podiumFace = null;
    try {
      localStorage.removeItem('smk_user_face');
      localStorage.removeItem('smk_user_back');
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
    get active() { return active; },
    get faceCanvas() { return userFaceCanvas; },
    get backCanvas() { return userBackCanvas; },
    get pilotName() { return pilotName; },
    get charIdx() { return charIdx; },
    get minimapIcon() { return minimapIcon; },
    get podiumFace() { return podiumFace; },
    get themes() { return CHAR_THEMES; }
  };
})();
