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

  /* Dibuja la gorra o accesorio temático adaptado al tamaño gigante de la cabeza */
  function drawBigHeadCap(fctx, hx, hy, tilt, scaleX, theme, characterIndex, isRearView, headW, headH) {
    fctx.save();
    // Situamos la gorra en la parte superior de la frente/coronilla
    fctx.translate(hx, hy - headH * 0.38);
    fctx.rotate(tilt * 0.85);
    fctx.scale(scaleX, 1);

    const capW = headW * 0.94;
    const capH = 26;

    if (characterIndex === 0 || characterIndex === 4) {
      // Mario (0) o Luigi (4): Gorra de béisbol con visera y emblema
      // Cúpula abombada
      fctx.fillStyle = theme.capColor;
      fctx.beginPath();
      fctx.ellipse(0, -6, capW / 2, capH * 0.75, 0, Math.PI, Math.PI * 2);
      fctx.fill();

      // Sombra/borde de visera
      fctx.fillStyle = theme.capDark;
      fctx.beginPath();
      fctx.ellipse(0, -2, capW * 0.48, 6, 0, 0, Math.PI * 2);
      fctx.fill();

      fctx.fillStyle = theme.capColor;
      fctx.beginPath();
      fctx.ellipse(0, -4, capW * 0.46, 5, 0, 0, Math.PI * 2);
      fctx.fill();

      if (!isRearView) {
        // Vista frontal/tres cuartos: círculo blanco y letra 'M' o 'L'
        fctx.fillStyle = '#ffffff';
        fctx.beginPath();
        fctx.arc(0, -12, 10, 0, Math.PI * 2);
        fctx.fill();

        fctx.fillStyle = theme.capColor;
        fctx.font = '900 13px sans-serif';
        fctx.textAlign = 'center';
        fctx.textBaseline = 'middle';
        fctx.fillText(theme.emblem, 0, -11);
      } else {
        // Vista trasera: el arco de ajuste elástico trasero de la gorra
        fctx.fillStyle = '#111111';
        fctx.beginPath();
        fctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI);
        fctx.fill();
        fctx.fillStyle = theme.capDark;
        fctx.fillRect(-10, -2, 20, 3);
      }
    } else if (characterIndex === 1) {
      // Princesa Peach: Corona dorada con joyas
      fctx.fillStyle = '#ffd700';
      fctx.strokeStyle = '#b8860b';
      fctx.lineWidth = 2;
      fctx.beginPath();
      fctx.moveTo(-22, 2);
      fctx.lineTo(-24, -22);
      fctx.lineTo(-12, -8);
      fctx.lineTo(0, -26);
      fctx.lineTo(12, -8);
      fctx.lineTo(24, -22);
      fctx.lineTo(22, 2);
      fctx.closePath();
      fctx.fill();
      fctx.stroke();

      // Rubí central
      fctx.fillStyle = '#e52521';
      fctx.beginPath();
      fctx.arc(0, -6, 5, 0, Math.PI * 2);
      fctx.fill();
    } else if (characterIndex === 7) {
      // Toad: Champiñón gigante con manchas rojas
      fctx.fillStyle = '#ffffff';
      fctx.strokeStyle = '#333333';
      fctx.lineWidth = 2;
      fctx.beginPath();
      fctx.ellipse(0, -12, capW * 0.58, 28, 0, 0, Math.PI * 2);
      fctx.fill();
      fctx.stroke();

      // Lunares rojos
      fctx.fillStyle = '#d81818';
      fctx.beginPath(); fctx.arc(0, -20, 11, 0, Math.PI * 2); fctx.fill();
      fctx.beginPath(); fctx.arc(-26, -10, 9, 0, Math.PI * 2); fctx.fill();
      fctx.beginPath(); fctx.arc(26, -10, 9, 0, Math.PI * 2); fctx.fill();
    } else if (characterIndex === 2) {
      // Bowser: Cuernos y cresta
      fctx.fillStyle = '#ffd700';
      // Cuerno izquierdo
      fctx.beginPath();
      fctx.moveTo(-26, 4); fctx.quadraticCurveTo(-38, -12, -42, -26); fctx.quadraticCurveTo(-26, -20, -18, 2);
      fctx.fill();
      // Cuerno derecho
      fctx.beginPath();
      fctx.moveTo(26, 4); fctx.quadraticCurveTo(38, -12, 42, -26); fctx.quadraticCurveTo(26, -20, 18, 2);
      fctx.fill();
      // Pelo naranja
      fctx.fillStyle = '#ff6600';
      fctx.beginPath();
      fctx.moveTo(-14, 0); fctx.lineTo(-6, -22); fctx.lineTo(0, -10); fctx.lineTo(6, -24); fctx.lineTo(14, 0);
      fctx.fill();
    } else {
      // Yoshi, DK, Koopa: Gorra deportiva o banda
      fctx.fillStyle = theme.capColor;
      fctx.beginPath();
      fctx.ellipse(0, -4, capW * 0.48, 12, 0, Math.PI, Math.PI * 2);
      fctx.fill();

      fctx.fillStyle = '#ffffff';
      fctx.font = '16px sans-serif';
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.fillText(theme.emblem, 0, -10);
    }

    fctx.restore();
  }

  /* Genera los 12 cuadros de conducción del kart en ALTA CALIDAD con cabeza grande exagerada */
  function buildDrivingFrames(characterIndex) {
    const ch = CHARACTERS[characterIndex];
    const rawSheet = Assets.img(ch.file.replace('drivers/', ''));
    if (!rawSheet || !userFaceCanvas) return null;

    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];
    const frames = [];

    // Resolución alta: 128x128 (4x respecto a los 32x32 de SNES)
    // Permite que la cara del usuario tenga calidad fotográfica cristalina sin cuadricular
    const SPRITE_SIZE = 128;

    for (let f = 0; f < 12; f++) {
      const origSlice = Assets.slice(ch.file.replace('drivers/', ''), {
        x: 32 * f, y: 32, w: 32, h: 32
      });

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = SPRITE_SIZE;
      frameCanvas.height = SPRITE_SIZE;
      const fctx = frameCanvas.getContext('2d');

      // 1. Dibujar el kart original escalado 4x manteniendo nitidez pixel-art retro
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(origSlice, 0, 0, 32, 32, 0, 0, SPRITE_SIZE, SPRITE_SIZE);

      // 2. Anclaje de la cabeza grande y ángulo según el fotograma
      // Fotogramas 0-4: Trasera (conducción hacia adelante en carrera)
      // Fotogramas 5-7: Perfil / lateral
      // Fotogramas 8-11: Frontal (trompo, podio, menú de selección)
      let hx = 64, hy = 44, tilt = 0, scaleX = 1;
      const isRearView = (f >= 0 && f <= 4);

      if (f === 0) { hx = 64; hy = 44; tilt = 0; }
      else if (f === 1) { hx = 67; hy = 45; tilt = 0.08; scaleX = 0.98; }
      else if (f === 2) { hx = 70; hy = 46; tilt = 0.16; scaleX = 0.96; }
      else if (f === 3) { hx = 74; hy = 47; tilt = 0.24; scaleX = 0.94; }
      else if (f === 4) { hx = 78; hy = 48; tilt = 0.32; scaleX = 0.92; } // derrape
      else if (f === 5) { hx = 76; hy = 47; tilt = 0.18; scaleX = 0.88; }
      else if (f === 6) { hx = 78; hy = 48; tilt = 0.10; scaleX = 0.82; }
      else if (f === 7) { hx = 80; hy = 49; tilt = 0; scaleX = 0.76; }    // lateral
      else if (f === 8) { hx = 75; hy = 48; tilt = -0.16; scaleX = 0.88; }
      else if (f === 9) { hx = 71; hy = 46; tilt = -0.10; scaleX = 0.94; }
      else if (f === 10) { hx = 67; hy = 45; tilt = -0.05; scaleX = 0.98; }
      else if (f === 11) { hx = 64; hy = 44; tilt = 0; }                   // frontal directo

      // 3. Borrar la cabeza pequeña original del sprite del kart
      fctx.save();
      fctx.beginPath();
      fctx.ellipse(hx, hy - 4, 32, 28, 0, 0, Math.PI * 2);
      fctx.clip();
      fctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      fctx.restore();

      // Elegir fuente de la foto:
      // Si estamos en vista trasera (0-4) y el usuario se tomó la foto de la nuca/pelo, ¡la usamos!
      // Si no tiene foto trasera, usamos la frontal para que se vea su cara en el kart
      const faceSource = (isRearView && userBackCanvas) ? userBackCanvas : userFaceCanvas;

      // 4. Dibujar la cabeza grande del usuario en MÁXIMA CALIDAD FOTOGRÁFICA
      // Tamaño grande y exagerado ("el máximo tamaño posible, incluso un poco más grande")
      const HEAD_W = 74;
      const HEAD_H = 80;

      fctx.save();
      fctx.translate(hx, hy);
      fctx.rotate(tilt);
      fctx.scale(scaleX, 1);

      // Sombra suave bajo la cabeza para integrarla sobre el kart
      fctx.save();
      fctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      fctx.beginPath();
      fctx.ellipse(0, HEAD_H / 2 - 2, HEAD_W * 0.46, 12, 0, 0, Math.PI * 2);
      fctx.fill();
      fctx.restore();

      // Recorte ovalado limpio con antialiasing
      fctx.save();
      fctx.beginPath();
      fctx.ellipse(0, 0, HEAD_W * 0.48, HEAD_H * 0.49, 0, 0, Math.PI * 2);
      fctx.clip();

      // Dibujar la foto en alta resolución con suavizado de máxima calidad (SIN PIXELAR / SIN CUADRICULAR)
      fctx.imageSmoothingEnabled = true;
      fctx.imageSmoothingQuality = 'high';
      fctx.drawImage(faceSource, -HEAD_W / 2, -HEAD_H / 2, HEAD_W, HEAD_H);
      fctx.restore();

      // Contorno exterior fino y definido para separar la cabeza del fondo del circuito
      fctx.save();
      fctx.strokeStyle = 'rgba(10, 5, 0, 0.85)';
      fctx.lineWidth = 2.5;
      fctx.beginPath();
      fctx.ellipse(0, 0, HEAD_W * 0.48, HEAD_H * 0.49, 0, 0, Math.PI * 2);
      fctx.stroke();
      fctx.restore();

      fctx.restore(); // Restaura transform de la cabeza

      // 5. Dibujar la gorra / accesorios del personaje encima de la cabeza grande
      drawBigHeadCap(fctx, hx, hy, tilt, scaleX, theme, characterIndex, isRearView, HEAD_W, HEAD_H);

      frames.push(frameCanvas);
    }

    return frames;
  }

  /* Crea icono en alta definición de 48x48 para el minimapa */
  function buildMinimapIcon(characterIndex) {
    if (!userFaceCanvas) return null;
    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fondo circular con color temático del personaje
    ctx.fillStyle = theme.border;
    ctx.beginPath(); ctx.arc(24, 24, 23, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.fill();

    // Cara en alta calidad
    ctx.save();
    ctx.beginPath(); ctx.arc(24, 25, 18, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(userFaceCanvas, 5, 6, 38, 38);
    ctx.restore();

    // Mini gorra superior
    ctx.fillStyle = theme.capColor;
    ctx.beginPath();
    ctx.ellipse(24, 9, 15, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    return c;
  }

  /* Crea icono en alta definición para el podio / trofeo */
  function buildPodiumFace(characterIndex) {
    if (!userFaceCanvas) return null;
    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Borde dorado de trofeo
    ctx.fillStyle = '#f8d820';
    ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();

    // Cara en alta resolución
    ctx.save();
    ctx.beginPath(); ctx.arc(64, 66, 52, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(userFaceCanvas, 10, 12, 108, 108);
    ctx.restore();

    // Gran gorra de campeón
    ctx.fillStyle = theme.capColor;
    ctx.beginPath();
    ctx.ellipse(64, 22, 44, 18, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.capDark;
    ctx.fillRect(24, 22, 80, 8);

    if (theme.emblem && theme.emblem.length === 1 && theme.emblem !== '👑' && theme.emblem !== '⚡' && theme.emblem !== '🐢' && theme.emblem !== '🍄' && theme.emblem !== '🥚') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(64, 12, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.capColor;
      ctx.font = '900 16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(theme.emblem, 64, 13);
    }

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
