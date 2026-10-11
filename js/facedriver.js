/* ============================================================
 * Süper Mario Kart Web - FaceDriver (Selfie & Cara Personalizada)
 * Motor Maestro de Compositor Facial 3D en Alta Definición (256x256)
 * "Modo Cabezón Arcade" Comercial de Máxima Calidad:
 * - Cobertura 360° en las 12 perspectivas (Frontal, Perfil, Nuca y Giro Dinámico).
 * - Giro Dinámico en Curvas/Derrape (Frames 1..4): ¡El piloto gira la cabeza
 *   hacia el interior de la curva permitiendo ver su rostro durante la carrera!
 * - Accesorios 3D auténticos de los 8 personajes (Mario, Luigi, Peach, Bowser, Koopa, Yoshi, DK, Toad).
 * - Sombra de visera y sombreado esférico fotorrealista sin recortes duros.
 * ============================================================ */
'use strict';

const FaceDriver = (() => {
  let active = false;
  let userFaceCanvas = null;      // Lienzo alta resolución con la cara frontal recortada
  let userBackCanvas = null;      // Lienzo alta resolución con la nuca/pelo por detrás
  let pilotName = 'MARIO';
  let charIdx = 0;               // 0 = Mario
  const customDriving = {};      // charIdx -> Array de 12 Canvas (256x256 alta definición)
  let podiumFace = null;         // Canvas 256x256 alta definición
  let minimapIcon = null;        // Canvas 64x64 alta definición
  let _lastFaceToken = null;
  let wearHeadgear = true;
  try {
    const savedHat = localStorage.getItem('smk_wear_headgear');
    if (savedHat !== null) wearHeadgear = (savedHat === '1');
  } catch (e) {}

  // Paleta auténtica y accesorios para los 8 personajes
  const CHAR_THEMES = [
    { name: 'mario', capColor: '#e52521', capDark: '#9e1010', capLight: '#ff5a52', emblem: 'M', emblemColor: '#e52521', border: '#e52521' },
    { name: 'princess', capColor: '#ffd700', capDark: '#c89e10', capLight: '#fff066', emblem: '👑', border: '#ff80bf', isCrown: true },
    { name: 'bowser', capColor: '#2e7d32', capDark: '#1b5e20', capLight: '#4caf50', emblem: '⚡', border: '#e65100', isBowser: true },
    { name: 'koopa', capColor: '#2e7d32', capDark: '#1b5e20', capLight: '#43a047', emblem: '🐢', border: '#ffb300', isKoopa: true },
    { name: 'luigi', capColor: '#00a651', capDark: '#006429', capLight: '#3dd678', emblem: 'L', emblemColor: '#00a651', border: '#00a651' },
    { name: 'yoshi', capColor: '#43a047', capDark: '#2e7d32', capLight: '#66bb6a', emblem: '🥚', border: '#ff7043', isYoshi: true },
    { name: 'dk', capColor: '#5d4037', capDark: '#3e2723', capLight: '#795548', emblem: 'DK', border: '#d32f2f', isDK: true },
    { name: 'toad', capColor: '#ffffff', capDark: '#d8d8d8', capLight: '#ffffff', emblem: '🍄', border: '#1976d2', isToad: true }
  ];

  /* Utilidades cromáticas para iluminación y volumen 3D */
  function parseColor(col) {
    if (!col) return [240, 200, 160];
    if (col.startsWith('#')) {
      const h = col.slice(1);
      if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
      if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const m = col.match(/\d+/g);
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
    return [240, 200, 160];
  }

  function adjustColor(col, factor) {
    const [r, g, b] = parseColor(col);
    const nr = Math.min(255, Math.max(0, Math.round(r * factor)));
    const ng = Math.min(255, Math.max(0, Math.round(g * factor)));
    const nb = Math.min(255, Math.max(0, Math.round(b * factor)));
    return `rgb(${nr},${ng},${nb})`;
  }

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

  /* Renderizado de pelo y nuca volumétrica 3D cuando no hay foto trasera */
  function drawBackHair(ctx, cx, cy, hw, hh, hairColor, skinColor) {
    const baseHair = hairColor || '#3a2010';
    const baseSkin = skinColor || '#f0c8a0';

    ctx.save();
    // 1. Cuello con sombra suave
    ctx.fillStyle = baseSkin;
    ctx.beginPath();
    ctx.ellipse(cx, cy + hh * 0.40, hw * 0.22, hh * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sombra oclusiva bajo la nuca
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + hh * 0.45, hw * 0.20, hh * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Orejas asomando en los laterales
    ctx.fillStyle = baseSkin;
    ctx.beginPath();
    ctx.ellipse(cx - hw * 0.44, cy + hh * 0.12, hw * 0.08, hh * 0.14, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + hw * 0.44, cy + hh * 0.12, hw * 0.08, hh * 0.14, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // 3. Masa de pelo volumétrica con gradiente esférico 3D
    const hairGrad = ctx.createRadialGradient(cx - hw * 0.12, cy - hh * 0.10, hw * 0.08, cx, cy, hw * 0.46);
    hairGrad.addColorStop(0, adjustColor(baseHair, 1.25));
    hairGrad.addColorStop(0.65, baseHair);
    hairGrad.addColorStop(1, adjustColor(baseHair, 0.60));
    ctx.fillStyle = hairGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, hw * 0.46, hh * 0.43, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Mechones sutiles en la parte baja de la nuca
    ctx.fillStyle = adjustColor(baseHair, 0.75);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + i * (hw * 0.10), cy + hh * 0.32, hw * 0.08, hh * 0.10, i * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* Renderizado del accesorio/gorra de alta definición para los 8 personajes */
  function drawHeadgear(ctx, characterIndex, frameIdx, cx, cy, hw, hh, yaw = 0) {
    if (!wearHeadgear) return; // Si el usuario eligió "Sin Gorra", ¡rostro y pelo 100% despejados!

    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];
    const isFront = frameIdx >= 8 && frameIdx <= 11;
    const isRear = frameIdx === 0;
    const isTurn = frameIdx >= 1 && frameIdx <= 4;
    const isSide = frameIdx >= 5 && frameIdx <= 7;

    ctx.save();

    // ----------------------------------------------------
    // 1. MARIO & LUIGI (Gorra de Visera Clásica colocada sobre la frente/coronilla)
    // ----------------------------------------------------
    if (theme.name === 'mario' || theme.name === 'luigi') {
      const capCol = theme.capColor;
      const capDark = theme.capDark;
      const capLight = theme.capLight;

      // Desplazamiento en perspectiva según yaw
      const yawOffX = Math.sin(yaw) * (hw * 0.18);

      // Cúpula abullonada de la gorra (Crown) situada arriba en la coronilla
      const crownY = cy - hh * 0.44;
      const crownW = hw * 0.45;
      const crownH = hh * 0.22;

      const cGrad = ctx.createRadialGradient(cx + yawOffX - crownW * 0.2, crownY - crownH * 0.2, crownW * 0.1, cx + yawOffX, crownY, crownW);
      cGrad.addColorStop(0, capLight);
      cGrad.addColorStop(0.55, capCol);
      cGrad.addColorStop(1, capDark);
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.ellipse(cx + yawOffX, crownY, crownW, crownH, yaw * 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Pliegues superiores de tela
      ctx.strokeStyle = adjustColor(capDark, 0.85);
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(cx + yawOffX, crownY, crownW * 0.75, Math.PI * 0.8, Math.PI * 1.4);
      ctx.stroke();

      // Visera / Ala de la gorra (termina por encima de las cejas, dejando ojos y rostro 100% visibles)
      if (isFront) {
        const visorY = cy - hh * 0.30;
        const visorW = hw * 0.44;
        const visorH = hh * 0.08;

        // Sombra sutil en la parte alta de la frente
        const shadowGrad = ctx.createLinearGradient(0, visorY, 0, visorY + hh * 0.07);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.30)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0.0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(cx + yawOffX, visorY + 3, visorW * 0.95, visorH * 1.2, 0, 0, Math.PI);
        ctx.fill();

        // Visera curvada estilizada
        const vGrad = ctx.createLinearGradient(cx - visorW, visorY - visorH, cx + visorW, visorY + visorH);
        vGrad.addColorStop(0, capLight);
        vGrad.addColorStop(0.6, capCol);
        vGrad.addColorStop(1, capDark);
        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.ellipse(cx + yawOffX, visorY, visorW, visorH, yaw * 0.12, 0, Math.PI);
        ctx.fill();

        ctx.strokeStyle = capLight;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Emblema circular blanco con letra 'M' o 'L' en la parte frontal de la cúpula
        const embR = hw * 0.105;
        const embX = cx + yawOffX * 1.05;
        const embY = crownY;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(embX, embY, embR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = theme.emblemColor || capCol;
        ctx.font = `900 ${Math.round(embR * 1.45)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(theme.emblem, embX, embY + 1);
      } else if (isTurn) {
        // Vista de giro
        const vTurnX = cx + yawOffX + (hw * 0.15);
        const vTurnY = cy - hh * 0.32;
        ctx.fillStyle = capDark;
        ctx.beginPath();
        ctx.ellipse(vTurnX, vTurnY, hw * 0.30, hh * 0.08, yaw * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = capLight;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      } else if (isSide) {
        // Vista lateral
        const vSideX = cx + (hw * 0.22);
        const vSideY = cy - hh * 0.30;
        ctx.fillStyle = capCol;
        ctx.beginPath();
        ctx.ellipse(vSideX, vSideY, hw * 0.26, hh * 0.07, 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else if (isRear) {
        // Vista trasera recta: banda posterior
        const bandY = cy - hh * 0.28;
        ctx.fillStyle = capDark;
        ctx.beginPath();
        ctx.ellipse(cx, bandY, hw * 0.40, hh * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = adjustColor(capDark, 0.7);
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }
    // ----------------------------------------------------
    // 2. PRINCESS PEACH (Corona Real de Oro sobre la Coronilla)
    // ----------------------------------------------------
    else if (theme.isCrown) {
      const crY = cy - hh * 0.52;
      const crW = hw * 0.32;
      const crH = hh * 0.20;
      const yawOffX = Math.sin(yaw) * (hw * 0.12);

      // Mechones dorados sobre la coronilla
      ctx.fillStyle = '#f8e060';
      ctx.beginPath();
      ctx.ellipse(cx - crW * 0.9, crY + crH * 0.8, hw * 0.12, hh * 0.16, -0.3, 0, Math.PI * 2);
      ctx.ellipse(cx + crW * 0.9, crY + crH * 0.8, hw * 0.12, hh * 0.16, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Corona de oro pulido
      const goldGrad = ctx.createLinearGradient(cx - crW, crY - crH, cx + crW, crY + crH);
      goldGrad.addColorStop(0, '#fff494');
      goldGrad.addColorStop(0.35, '#ffd700');
      goldGrad.addColorStop(0.8, '#d4af37');
      goldGrad.addColorStop(1, '#8c6d1f');
      ctx.fillStyle = goldGrad;

      ctx.beginPath();
      ctx.moveTo(cx + yawOffX - crW * 0.7, crY + crH);
      ctx.lineTo(cx + yawOffX - crW * 0.9, crY - crH * 0.4);
      ctx.lineTo(cx + yawOffX - crW * 0.35, crY + crH * 0.3);
      ctx.lineTo(cx + yawOffX, crY - crH * 0.9);
      ctx.lineTo(cx + yawOffX + crW * 0.35, crY + crH * 0.3);
      ctx.lineTo(cx + yawOffX + crW * 0.9, crY - crH * 0.4);
      ctx.lineTo(cx + yawOffX + crW * 0.7, crY + crH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff8b3';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Rubí central
      ctx.fillStyle = '#e52521';
      ctx.beginPath();
      ctx.ellipse(cx + yawOffX, crY + crH * 0.4, crW * 0.16, crH * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // ----------------------------------------------------
    // 3. TOAD (Sombrero Champiñón Blanco con Lunares sobre la Cabeza)
    // ----------------------------------------------------
    else if (theme.isToad) {
      const mushY = cy - hh * 0.46;
      const mushW = hw * 0.52;
      const mushH = hh * 0.26;
      const yawOffX = Math.sin(yaw) * (hw * 0.14);

      const mGrad = ctx.createRadialGradient(cx + yawOffX - mushW * 0.2, mushY - mushH * 0.2, mushW * 0.1, cx + yawOffX, mushY, mushW);
      mGrad.addColorStop(0, '#ffffff');
      mGrad.addColorStop(0.75, '#f0f0f5');
      mGrad.addColorStop(1, '#c5c5d2');
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.ellipse(cx + yawOffX, mushY, mushW, mushH, yaw * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a0a0b0';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Lunares rojos
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.ellipse(cx + yawOffX, mushY - mushH * 0.2, mushW * 0.30, mushH * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + yawOffX - mushW * 0.65, mushY + mushH * 0.1, mushW * 0.22, mushH * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + yawOffX + mushW * 0.65, mushY + mushH * 0.1, mushW * 0.22, mushH * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // ----------------------------------------------------
    // 4. BOWSER (Cuernos de Marfil y Cresta Superior)
    // ----------------------------------------------------
    else if (theme.isBowser) {
      const crY = cy - hh * 0.48;
      const yawOffX = Math.sin(yaw) * (hw * 0.12);

      ctx.fillStyle = '#e65100';
      for (let s = -2; s <= 2; s++) {
        ctx.beginPath();
        ctx.moveTo(cx + yawOffX + s * (hw * 0.08), crY + hh * 0.08);
        ctx.lineTo(cx + yawOffX + s * (hw * 0.09), crY - hh * 0.22 - Math.abs(s) * 3);
        ctx.lineTo(cx + yawOffX + s * (hw * 0.08) + 10, crY + hh * 0.08);
        ctx.fill();
      }

      // Cuernos laterales
      const hornGrad = ctx.createLinearGradient(cx - hw * 0.45, crY, cx + hw * 0.45, crY - hh * 0.2);
      hornGrad.addColorStop(0, '#fff8e7');
      hornGrad.addColorStop(0.7, '#d7ccc8');
      hornGrad.addColorStop(1, '#5d4037');
      ctx.fillStyle = hornGrad;

      ctx.beginPath();
      ctx.moveTo(cx + yawOffX - hw * 0.28, crY + 5);
      ctx.quadraticCurveTo(cx + yawOffX - hw * 0.55, crY - hh * 0.08, cx + yawOffX - hw * 0.50, crY - hh * 0.35);
      ctx.quadraticCurveTo(cx + yawOffX - hw * 0.35, crY - hh * 0.15, cx + yawOffX - hw * 0.22, crY + 8);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx + yawOffX + hw * 0.28, crY + 5);
      ctx.quadraticCurveTo(cx + yawOffX + hw * 0.55, crY - hh * 0.08, cx + yawOffX + hw * 0.50, crY - hh * 0.35);
      ctx.quadraticCurveTo(cx + yawOffX + hw * 0.35, crY - hh * 0.15, cx + yawOffX + hw * 0.22, crY + 8);
      ctx.fill();
    }
    // ----------------------------------------------------
    // 5. KOOPA TROOPA (Casco Caparazón Verde Superior)
    // ----------------------------------------------------
    else if (theme.isKoopa) {
      const kY = cy - hh * 0.44;
      const kW = hw * 0.46;
      const kH = hh * 0.20;

      const kGrad = ctx.createRadialGradient(cx - kW * 0.2, kY - kH * 0.2, kW * 0.1, cx, kY, kW);
      kGrad.addColorStop(0, '#4caf50');
      kGrad.addColorStop(0.65, '#2e7d32');
      kGrad.addColorStop(1, '#1b5e20');
      ctx.fillStyle = kGrad;
      ctx.beginPath();
      ctx.ellipse(cx, kY, kW, kH, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fbc02d';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(cx, kY + kH * 0.5, kW * 0.95, kH * 0.35, 0, 0, Math.PI);
      ctx.stroke();
    }
    // ----------------------------------------------------
    // 6. YOSHI (Capucha Dino Verde Superior)
    // ----------------------------------------------------
    else if (theme.isYoshi) {
      const yY = cy - hh * 0.48;
      const yW = hw * 0.44;
      const yH = hh * 0.20;

      ctx.fillStyle = '#43a047';
      ctx.beginPath();
      ctx.ellipse(cx, yY, yW, yH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ojos saltones arriba
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx - yW * 0.42, yY - yH * 0.45, yW * 0.28, yH * 0.32, -0.2, 0, Math.PI * 2);
      ctx.ellipse(cx + yW * 0.42, yY - yH * 0.45, yW * 0.28, yH * 0.32, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2e7d32';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#101018';
      ctx.beginPath();
      ctx.ellipse(cx - yW * 0.42 + 2, yY - yH * 0.40, 3.5, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + yW * 0.42 - 2, yY - yH * 0.40, 3.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // ----------------------------------------------------
    // 7. DONKEY KONG (Remolino de Pelo Castaño Superior)
    // ----------------------------------------------------
    else if (theme.isDK) {
      const dkY = cy - hh * 0.48;
      const dkW = hw * 0.42;

      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.ellipse(cx, dkY, dkW, hh * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      ctx.moveTo(cx - 14, dkY - hh * 0.15);
      ctx.quadraticCurveTo(cx, dkY - hh * 0.45, cx + 15, dkY - hh * 0.38);
      ctx.quadraticCurveTo(cx + 6, dkY - hh * 0.20, cx + 12, dkY - hh * 0.12);
      ctx.fill();
    }

    ctx.restore();
  }

  /* Generador de los 12 cuadros de conducción a resolución de 256x256 (Modo Cabezón HD) */
  function buildDrivingFrames(characterIndex) {
    const ch = (typeof CHARACTERS !== 'undefined' && CHARACTERS[characterIndex]) ? CHARACTERS[characterIndex] : null;
    if (!ch) return null;
    const driverName = ch.file.replace('drivers/', '');
    const rawSheet = Assets.img(driverName);
    if (!rawSheet || !userFaceCanvas) return null;

    const frames = [];
    const SPRITE_SIZE = 256; // 8x sobre los 32x32 de SNES para fidelidad comercial absoluta

    const skinColor = userFaceCanvas._skinColor || '#f0c8a0';
    const hairColor = userFaceCanvas._hairColor || '#3a2010';

    for (let f = 0; f < 12; f++) {
      const origSlice = Assets.slice(driverName, {
        x: 32 * f, y: 32, w: 32, h: 32
      });

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = SPRITE_SIZE;
      frameCanvas.height = SPRITE_SIZE;
      const fctx = frameCanvas.getContext('2d');
      fctx.imageSmoothingEnabled = true;
      fctx.imageSmoothingQuality = 'high';

      // 1. DIBUJAR CHASIS ORIGINAL DEL KART Y RUEDAS EN LA BASE (filas 18 a 32 de SNES -> y = 144..256)
      // Manteniendo el kart original exactamente en su sitio sobre el asfalto
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(origSlice, 0, 18, 32, 14, 0, 144, 256, 112);

      // 2. DIBUJAR CUERPO, HOMBROS Y VOLANTE (filas 12 a 18 de SNES -> y = 96..144)
      fctx.drawImage(origSlice, 0, 12, 32, 7, 0, 96, 256, 56);
      fctx.imageSmoothingEnabled = true;

      // -----------------------------------------------------------------
      // CASO A: VISTA TRASERA RECTA (Frame 0 - conduciendo en línea recta)
      // -----------------------------------------------------------------
      if (f === 0) {
        const cx = 128, cy = 94, hw = 126, hh = 120;
        if (userBackCanvas) {
          // Si el usuario capturó foto de nuca/por detrás:
          fctx.save();
          fctx.beginPath();
          fctx.ellipse(cx, cy + 4, hw * 0.44, hh * 0.42, 0, 0, Math.PI * 2);
          fctx.clip();
          fctx.drawImage(userBackCanvas, cx - hw / 2, cy - hh / 2 + 4, hw, hh);
          fctx.restore();
        } else {
          // Si NO hay foto trasera: generamos pelo 3D volumétrico sintetizado con su tono real
          drawBackHair(fctx, cx, cy, hw, hh, hairColor, skinColor);
        }
        // Accesorio/gorra original vista desde atrás
        drawHeadgear(fctx, characterIndex, 0, cx, cy, hw, hh, 0);
      }
      // -----------------------------------------------------------------
      // CASO B: GIRO EN CURVA & DERRAPE DINÁMICO (Frames 1 a 4)
      // ¡EL PILOTO GIRA LA CABEZA HACIA EL ÁPICE DE LA CURVA!
      // -----------------------------------------------------------------
      else if (f >= 1 && f <= 4) {
        const turnK = f / 4; // 0.25 (Frame 1) .. 1.0 (Frame 4 Derrape)
        const yaw = turnK * Math.PI * 0.38; // Ángulo de giro de cabeza hasta ~68°
        const cx = 128 + Math.round(f * 3.5);
        const cy = 94;
        const hw = 126 + Math.round(f * 2);
        const hh = 122;

        fctx.save();

        // 1. Parte izquierda/posterior de la cabeza (pelo / nuca)
        fctx.save();
        fctx.beginPath();
        fctx.ellipse(cx - Math.round(hw * 0.12), cy, hw * 0.44, hh * 0.42, -yaw * 0.2, 0, Math.PI * 2);
        fctx.clip();
        if (userBackCanvas) {
          fctx.drawImage(userBackCanvas, cx - hw / 2 - 10, cy - hh / 2, hw, hh);
        } else {
          drawBackHair(fctx, cx - Math.round(hw * 0.12), cy, hw, hh, hairColor, skinColor);
        }
        fctx.restore();

        // 2. Parte derecha/frontal: ¡EL ROSTRO DEL JUGADOR GIRANDO EN PERSPECTIVA 3D!
        // En frame 1 se ve la mejilla y patilla; en frames 2-4 se aprecian perfectamente
        // el ojo, pómulo, sonrisa y mandíbula asomándose en el giro.
        const faceW = Math.round(hw * (0.55 + turnK * 0.40));
        const faceH = hh;
        const faceX = cx - Math.round(hw * 0.10) + Math.round(turnK * 20);
        const faceY = cy;

        fctx.save();
        fctx.beginPath();
        fctx.ellipse(faceX, faceY, faceW * 0.46, faceH * 0.45, yaw * 0.15, 0, Math.PI * 2);
        fctx.clip();
        fctx.drawImage(userFaceCanvas, faceX - faceW / 2, faceY - faceH / 2, faceW, faceH);
        fctx.restore();

        // 3. Accesorio/gorra orientada con el giro
        drawHeadgear(fctx, characterIndex, f, cx, cy, hw, hh, yaw);

        fctx.restore();
      }
      // -----------------------------------------------------------------
      // CASO C: VISTAS LATERALES Y DE PERFIL (Frames 5 a 7)
      // -----------------------------------------------------------------
      else if (f >= 5 && f <= 7) {
        const cx = 132;
        const cy = 94;
        const hw = 124;
        const hh = 120;
        const yaw = Math.PI * 0.50; // Perfil 90°

        fctx.save();
        // Silueta lateral con tono de piel y patilla del jugador
        fctx.fillStyle = skinColor;
        fctx.beginPath();
        fctx.ellipse(cx, cy, hw * 0.42, hh * 0.44, 0.1, 0, Math.PI * 2);
        fctx.fill();

        // Parte posterior del pelo lateral
        fctx.fillStyle = hairColor;
        fctx.beginPath();
        fctx.ellipse(cx - hw * 0.18, cy, hw * 0.32, hh * 0.42, 0, 0, Math.PI * 2);
        fctx.fill();

        // Cara asomando en el lateral derecho
        fctx.save();
        fctx.beginPath();
        fctx.ellipse(cx + 8, cy, hw * 0.34, hh * 0.42, 0, 0, Math.PI * 2);
        fctx.clip();
        fctx.drawImage(userFaceCanvas, cx - hw / 2 + 18, cy - hh / 2, hw, hh);
        fctx.restore();

        // Gorra/accesorio de perfil
        drawHeadgear(fctx, characterIndex, f, cx, cy, hw, hh, yaw);
        fctx.restore();
      }
      // -----------------------------------------------------------------
      // CASO D: VISTAS FRONTALES (Frames 8 a 11 - ¡MODO CABEZÓN ARCADE TOTAL!)
      // -----------------------------------------------------------------
      else {
        // Encarando a la cámara: cara tan ancha como la cabeza completa del personaje
        let cx = 128, cy = 96, hw = 138, hh = 128;
        let yaw = 0;
        if (f === 11) { cx = 128; cy = 96; hw = 140; hh = 130; yaw = 0; } // Frontal directo: de oreja a oreja
        else if (f === 10) { cx = 130; cy = 96; hw = 136; hh = 128; yaw = 0.12; }
        else if (f === 9) { cx = 133; cy = 96; hw = 132; hh = 126; yaw = 0.25; }
        else if (f === 8) { cx = 136; cy = 96; hw = 128; hh = 124; yaw = 0.38; }

        // Borrar cara original
        fctx.clearRect(24, 40, 208, 110);

        // 1. Integrar el selfie en alta resolución ocupando todo el ancho de la cabeza
        fctx.save();
        fctx.beginPath();
        fctx.ellipse(cx, cy, hw * 0.48, hh * 0.47, yaw * 0.1, 0, Math.PI * 2);
        fctx.clip();
        fctx.drawImage(userFaceCanvas, cx - hw / 2, cy - hh / 2, hw, hh);

        // 2. Sombra de oclusión ambiental bajo la barbilla
        const chinShadow = fctx.createLinearGradient(0, cy + hh * 0.30, 0, cy + hh * 0.48);
        chinShadow.addColorStop(0, 'rgba(0,0,0,0.0)');
        chinShadow.addColorStop(1, 'rgba(0,0,0,0.38)');
        fctx.fillStyle = chinShadow;
        fctx.fill();
        fctx.restore();

        // 3. Accesorio/Gorra HD auténtica redibujada por encima con visera y emblema
        drawHeadgear(fctx, characterIndex, f, cx, cy, hw, hh, yaw);

        // 4. Volante y manos del piloto en primer plano delante del pecho
        fctx.imageSmoothingEnabled = false;
        fctx.drawImage(origSlice, 0, 19, 32, 9, 0, 152, 256, 72);
        fctx.imageSmoothingEnabled = true;
      }

      frames.push(frameCanvas);
    }

    return frames;
  }

  /* Crea icono circular en alta definición de 64x64 para el minimapa y medallas */
  function buildMinimapIcon(characterIndex) {
    if (!userFaceCanvas) return null;
    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Bisel exterior metálico
    const bGrad = ctx.createLinearGradient(0, 0, 64, 64);
    bGrad.addColorStop(0, '#ffe066');
    bGrad.addColorStop(0.5, theme.border || '#e52521');
    bGrad.addColorStop(1, '#9e1010');
    ctx.fillStyle = bGrad;
    ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.fill();

    // Bisel oscuro interior
    ctx.fillStyle = '#0e0e18';
    ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.fill();

    // 2. Foto del piloto recortada
    ctx.save();
    ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.clip();

    const bgGrad = ctx.createRadialGradient(32, 32, 4, 32, 32, 26);
    bgGrad.addColorStop(0, '#242438');
    bgGrad.addColorStop(1, '#0e0e18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(6, 6, 52, 52);

    const fw = 44, fh = 42, cx = 32, cy = 34;
    ctx.drawImage(userFaceCanvas, cx - fw / 2, cy - fh / 2, fw, fh);

    // Accesorio sobre la cabeza
    drawHeadgear(ctx, characterIndex, 11, cx, cy, fw * 1.05, fh * 1.05, 0);
    ctx.restore();

    // 3. Brillo de cristal arcade superior
    ctx.save();
    ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.ellipse(32, 16, 22, 10, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. Filo dorado
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(32, 32, 26.5, 0, Math.PI * 2); ctx.stroke();

    return c;
  }

  /* Crea retrato trofeo en máxima resolución (256x256) para el podio de victoria */
  function buildPodiumFace(characterIndex) {
    if (!userFaceCanvas) return null;
    const theme = CHAR_THEMES[characterIndex] || CHAR_THEMES[0];

    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Marco dorado de campeonato
    const goldGrad = ctx.createLinearGradient(0, 0, 256, 256);
    goldGrad.addColorStop(0, '#fff494');
    goldGrad.addColorStop(0.25, '#ffd700');
    goldGrad.addColorStop(0.7, '#d4af37');
    goldGrad.addColorStop(1, '#8c6d1f');
    ctx.fillStyle = goldGrad;
    ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fill();

    // Tachuelas ornamentales
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const sx = 128 + Math.cos(a) * 118;
      const sy = 128 + Math.sin(a) * 118;
      ctx.fillStyle = '#fff8b3';
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#101020';
    ctx.beginPath(); ctx.arc(128, 128, 110, 0, Math.PI * 2); ctx.fill();

    // 2. Retrato del campeón
    ctx.save();
    ctx.beginPath(); ctx.arc(128, 128, 108, 0, Math.PI * 2); ctx.clip();

    const spot = ctx.createRadialGradient(128, 120, 20, 128, 128, 110);
    spot.addColorStop(0, theme.border || '#e52521');
    spot.addColorStop(0.65, '#1a1a2e');
    spot.addColorStop(1, '#0a0a14');
    ctx.fillStyle = spot;
    ctx.fillRect(20, 20, 216, 216);

    const fw = 152, fh = 144, cx = 128, cy = 138;
    ctx.drawImage(userFaceCanvas, cx - fw / 2, cy - fh / 2, fw, fh);

    // Gorra/corona de victoria
    drawHeadgear(ctx, characterIndex, 11, cx, cy, fw * 1.05, fh * 1.05, 0);
    ctx.restore();

    // 3. Destello de estrella de victoria
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const gx = 208, gy = 48;
    ctx.beginPath(); ctx.arc(gx, gy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx - 12, gy); ctx.lineTo(gx + 12, gy);
    ctx.moveTo(gx, gy - 12); ctx.lineTo(gx, gy + 12);
    ctx.stroke();

    return c;
  }

  /* Aplica las fotos (frontal + trasera opcional) al juego */
  function setFace(frontCanvas, backCanvas = null, cIdx = 0, name = 'PILOTO', persist = true) {
    const faceChanged = (userFaceCanvas !== frontCanvas) || (userBackCanvas !== backCanvas);
    const charChanged = (charIdx !== cIdx);

    userFaceCanvas = frontCanvas;
    userBackCanvas = backCanvas;
    charIdx = cIdx;
    pilotName = (name || 'PILOTO').toUpperCase().slice(0, 8);
    active = true;

    // Solo reconstruir lienzos si ha habido cambio de imagen o de personaje (optimización 60fps)
    if (faceChanged || charChanged || !customDriving[charIdx]) {
      customDriving[charIdx] = buildDrivingFrames(charIdx);
      minimapIcon = buildMinimapIcon(charIdx);
      podiumFace = buildPodiumFace(charIdx);
    }

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
    if (!active || !animator) return;
    const cIdx = (typeof characterIndex === 'number' && characterIndex >= 0) ? characterIndex : charIdx;
    if (!customDriving[cIdx] || !Array.isArray(customDriving[cIdx]) || customDriving[cIdx].length !== 12) {
      customDriving[cIdx] = buildDrivingFrames(cIdx);
    }
    if (Array.isArray(customDriving[cIdx]) && customDriving[cIdx].length === 12) {
      animator.driving = customDriving[cIdx];
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
    buildPodiumFace,
    drawHeadgear,
    get active() { return active; },
    get faceCanvas() { return userFaceCanvas; },
    get backCanvas() { return userBackCanvas; },
    get pilotName() { return pilotName; },
    get charIdx() { return charIdx; },
    get minimapIcon() { return minimapIcon; },
    get podiumFace() { return podiumFace; },
    get themes() { return CHAR_THEMES; },
    get wearHeadgear() { return wearHeadgear; },
    setWearHeadgear(val) {
      wearHeadgear = !!val;
      try { localStorage.setItem('smk_wear_headgear', wearHeadgear ? '1' : '0'); } catch (e) {}
      Object.keys(customDriving).forEach(k => delete customDriving[k]);
      if (userFaceCanvas) {
        minimapIcon = buildMinimapIcon(charIdx);
        podiumFace = buildPodiumFace(charIdx);
      }
    }
  };
})();
