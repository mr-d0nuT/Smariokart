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

  // Ángulos de rotación 3D para los 12 cuadros de conducción del kart
  // 0: Vista trasera directa (0 rad)
  // 1-4: Giro hacia la derecha visto desde atrás
  // 5-7: Transición y perfil lateral (π/2 rad)
  // 8-10: Giro frontal hacia la cámara
  // 11: Vista frontal directa encarando la cámara (π rad)
  const FRAME_ANGLES = [0, 0.31, 0.63, 0.96, 1.26, 1.40, 1.50, Math.PI / 2, 2.01, 2.41, 2.79, Math.PI];

  function getCanvasPixelData(c) {
    if (!c) return null;
    const w = c.width || 256, h = c.height || 256;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    return {
      data: ctx.getImageData(0, 0, w, h).data,
      w, h
    };
  }

  function sampleTexture(tex, u, v) {
    if (!tex || !tex.data) return { r: 180, g: 150, b: 120, a: 255 };
    const su = Math.max(0, Math.min(1, u));
    const sv = Math.max(0, Math.min(1, v));
    const px = Math.min(tex.w - 1, Math.floor(su * tex.w));
    const py = Math.min(tex.h - 1, Math.floor(sv * tex.h));
    const idx = (py * tex.w + px) * 4;
    return {
      r: tex.data[idx],
      g: tex.data[idx + 1],
      b: tex.data[idx + 2],
      a: tex.data[idx + 3]
    };
  }

  /* Proyecta las fotos como textura sobre la forma 3D de la cabeza (elipsoide/esfera),
   * adaptándose a la curvatura esférica, la rotación 3D en el ángulo alpha, el sombreado
   * volumétrico de luz y el oscurecimiento de bordes estilo Super Nintendo. */
  function render3DTexturedHead(alpha, headW, headH, frontCanvas, backCanvas) {
    const pad = 6;
    const outW = headW + pad * 2;
    const outH = headH + pad * 2;
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(outW, outH);
    const out = imgData.data;

    const frontTex = getCanvasPixelData(frontCanvas);
    const backTex = getCanvasPixelData(backCanvas || frontCanvas);

    const Rx = headW / 2;
    const Ry = headH / 2;
    const cx = Math.round(outW / 2);
    const cy = Math.round(outH / 2);

    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);

    // Vector de luz direccional (arriba-frente-izquierda)
    const Lx = -0.37, Ly = -0.62, Lz = 0.69;

    for (let dy = -Ry; dy <= Ry; dy++) {
      const ny = dy / Ry;
      const ny2 = ny * ny;
      if (ny2 >= 1.0) continue;
      const maxDx = Math.round(Rx * Math.sqrt(1 - ny2));
      const rowOffset = (cy + dy) * outW;

      for (let dx = -maxDx; dx <= maxDx; dx++) {
        const nx = dx / Rx;
        const d2 = nx * nx + ny2;
        if (d2 >= 1.0) continue;

        // Coordenada Z de la superficie esférica 3D (profundidad hacia la pantalla)
        const z = Math.sqrt(1.0 - d2);

        // Rotación 3D del vector normal/superficie respecto al eje vertical de la cabeza
        const Xhead = nx * cosA + z * sinA;
        const Zhead = -nx * sinA + z * cosA;

        // Coordenadas esféricas de la textura (longitud y latitud sobre la cabeza)
        const angleH = Math.atan2(Xhead, Math.abs(Zhead)); // [-PI/2, PI/2]
        const uNorm = 0.5 + (angleH / Math.PI) * 1.05;
        const vNorm = 0.5 + (ny * 0.48);

        // Muestrear textura frontal o trasera con zona de transición suave en las sienes/orejas
        let r = 0, g = 0, b = 0, a = 255;
        const blendDist = 0.18;

        if (Zhead < -blendDist) {
          // Vista frontal directa o ángulo delantero
          const col = sampleTexture(frontTex, uNorm, vNorm);
          r = col.r; g = col.g; b = col.b; a = col.a;
        } else if (Zhead > blendDist) {
          // Vista trasera o nuca
          const col = sampleTexture(backTex, uNorm, vNorm);
          r = col.r; g = col.g; b = col.b; a = col.a;
        } else {
          // Mezcla suave en el lateral/perfil de la cabeza (360° continuo)
          const fCol = sampleTexture(frontTex, uNorm, vNorm);
          const bCol = sampleTexture(backTex, uNorm, vNorm);
          const t = (Zhead + blendDist) / (2 * blendDist); // 0 = frontal, 1 = trasera
          r = (1 - t) * fCol.r + t * bCol.r;
          g = (1 - t) * fCol.g + t * bCol.g;
          b = (1 - t) * fCol.b + t * bCol.b;
          a = Math.max(fCol.a, bCol.a);
        }

        if (a < 10) continue;

        // Sombreado 3D volumétrico:
        // Iluminación difusa (Lambertiana) + luz ambiental
        const NdotL = Math.max(0, nx * Lx + ny * Ly + z * Lz);
        const ambient = 0.74;
        const diffuse = 0.32 * NdotL;
        // Oscurecimiento de borde (Limb darkening / Fresnel) para realzar el volumen esférico 3D
        const rim = 0.52 + 0.48 * Math.pow(z, 0.42);
        // Sombra suave proyectada por la gorra/visera en la frente y coronilla
        const capShadow = (ny < -0.22) ? Math.max(0.72, 1.0 - 0.28 * Math.min(1, (-ny - 0.22) / 0.25)) : 1.0;

        const light = (ambient + diffuse) * rim * capShadow;

        // Borde exterior con contorno de cómic retro (estilo SNES)
        const edgeFactor = 1.0 - d2;
        let outR = Math.min(255, Math.round(r * light));
        let outG = Math.min(255, Math.round(g * light));
        let outB = Math.min(255, Math.round(b * light));

        if (edgeFactor < 0.08) {
          const edgeT = edgeFactor / 0.08;
          outR = Math.round(outR * edgeT + 20 * (1 - edgeT));
          outG = Math.round(outG * edgeT + 12 * (1 - edgeT));
          outB = Math.round(outB * edgeT + 8 * (1 - edgeT));
        }

        const pIdx = (rowOffset + (cx + dx)) * 4;
        out[pIdx] = outR;
        out[pIdx + 1] = outG;
        out[pIdx + 2] = outB;
        out[pIdx + 3] = a;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  /* Dibuja la gorra o accesorio temático adaptado al ángulo 3D y tamaño de la cabeza */
  function drawBigHeadCap(fctx, hx, hy, tilt, alpha, theme, characterIndex, headW, headH) {
    fctx.save();
    // Situamos la gorra en la parte superior de la frente/coronilla
    fctx.translate(hx, hy - headH * 0.38);
    fctx.rotate(tilt * 0.85);

    const capW = headW * 0.94;
    const capH = 26;

    if (characterIndex === 0 || characterIndex === 4) {
      // Mario (0) o Luigi (4): Gorra de béisbol con visera y emblema adaptada al ángulo 3D
      const isRear = alpha < 1.35;
      const isProfile = alpha >= 1.35 && alpha <= 1.85;

      // Cúpula abombada de la gorra
      fctx.fillStyle = theme.capColor;
      fctx.beginPath();
      fctx.ellipse(0, -7, capW / 2, capH * 0.75, 0, Math.PI, Math.PI * 2);
      fctx.fill();

      // Banda base
      fctx.fillStyle = theme.capDark;
      fctx.beginPath();
      fctx.ellipse(0, -3, capW * 0.48, 6, 0, 0, Math.PI * 2);
      fctx.fill();

      if (isRear) {
        // Vista trasera: ajuste de la gorra
        fctx.fillStyle = '#111111';
        fctx.beginPath();
        fctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI);
        fctx.fill();
        fctx.fillStyle = theme.capDark;
        fctx.fillRect(-10, -2, 20, 3);
      } else if (isProfile) {
        // Vista de perfil/lateral: la visera sobresale hacia el lateral en 3D
        fctx.fillStyle = theme.capColor;
        fctx.beginPath();
        fctx.ellipse(capW * 0.22, -2, capW * 0.36, 7, 0.15, 0, Math.PI * 2);
        fctx.fill();
        fctx.fillStyle = theme.capDark;
        fctx.fillRect(0, 0, capW * 0.3, 3);
      } else {
        // Vista frontal: visera curvada hacia adelante con emblema
        fctx.fillStyle = theme.capColor;
        fctx.beginPath();
        fctx.ellipse(0, -3, capW * 0.46, 7, 0, 0, Math.PI * 2);
        fctx.fill();

        // Parche blanco circular y letra M o L
        fctx.fillStyle = '#ffffff';
        fctx.beginPath();
        fctx.arc(0, -12, 10, 0, Math.PI * 2);
        fctx.fill();

        fctx.fillStyle = theme.capColor;
        fctx.font = '900 13px sans-serif';
        fctx.textAlign = 'center';
        fctx.textBaseline = 'middle';
        fctx.fillText(theme.emblem, 0, -11);
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

  /* Genera los 12 cuadros de conducción del kart con la textura fotográfica adaptada a la forma 3D */
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
      let hx = 64, hy = 44, tilt = 0, scaleX = 1;
      const alpha = FRAME_ANGLES[f];

      if (f === 0) { hx = 64; hy = 44; tilt = 0; }
      else if (f === 1) { hx = 67; hy = 45; tilt = 0.08; scaleX = 0.98; }
      else if (f === 2) { hx = 70; hy = 46; tilt = 0.16; scaleX = 0.96; }
      else if (f === 3) { hx = 74; hy = 47; tilt = 0.24; scaleX = 0.94; }
      else if (f === 4) { hx = 78; hy = 48; tilt = 0.32; scaleX = 0.92; } // derrape
      else if (f === 5) { hx = 76; hy = 47; tilt = 0.18; scaleX = 0.90; }
      else if (f === 6) { hx = 78; hy = 48; tilt = 0.10; scaleX = 0.86; }
      else if (f === 7) { hx = 80; hy = 49; tilt = 0; scaleX = 0.82; }    // lateral/perfil
      else if (f === 8) { hx = 75; hy = 48; tilt = -0.16; scaleX = 0.90; }
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

      // 4. Proyectar la foto como textura adaptada a la forma 3D de la cabeza
      const HEAD_W = 74;
      const HEAD_H = 80;

      const head3D = render3DTexturedHead(alpha, HEAD_W, HEAD_H, userFaceCanvas, userBackCanvas);

      fctx.save();
      fctx.translate(hx, hy);
      fctx.rotate(tilt);
      fctx.scale(scaleX, 1);

      // Sombra suave bajo la cabeza para integrarla sobre el chasis del kart
      fctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      fctx.beginPath();
      fctx.ellipse(0, HEAD_H / 2 - 2, HEAD_W * 0.46, 12, 0, 0, Math.PI * 2);
      fctx.fill();

      // Dibujar la cabeza 3D con calidad fotográfica suavizada
      fctx.imageSmoothingEnabled = true;
      fctx.imageSmoothingQuality = 'high';
      fctx.drawImage(head3D, -head3D.width / 2, -head3D.height / 2);

      fctx.restore();

      // 5. Dibujar la gorra / accesorios 3D del personaje
      drawBigHeadCap(fctx, hx, hy, tilt, alpha, theme, characterIndex, HEAD_W, HEAD_H);

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

    // Cara 3D en alta calidad
    const head3D = render3DTexturedHead(Math.PI, 36, 38, userFaceCanvas, userBackCanvas);
    ctx.save();
    ctx.beginPath(); ctx.arc(24, 25, 18, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(head3D, 24 - head3D.width / 2, 25 - head3D.height / 2);
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

    // Cara 3D en alta resolución
    const head3D = render3DTexturedHead(Math.PI, 92, 96, userFaceCanvas, userBackCanvas);
    ctx.save();
    ctx.beginPath(); ctx.arc(64, 66, 52, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(head3D, 64 - head3D.width / 2, 66 - head3D.height / 2);
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
