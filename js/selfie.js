/* ============================================================
 * Süper Mario Kart Web - Selfie & Pilot Setup Modal
 * Reutiliza las funciones de captura y recorte de cara (FaceCut)
 * con estética Super Nintendo para que el jugador lleve su cara.
 * ============================================================ */
'use strict';

const SelfieSetup = (() => {
  const $ = id => document.getElementById(id);
  let root, video, shot, countdownEl, flashEl, camMsg, faceStatus;
  let btnPhoto, btnRetake, btnNoPhoto, btnOk, btnClose, fileInput;
  let charGrid, nameInput, previewCanvas, pctx;

  let stream = null;
  let camOK = false;
  let active = false;
  let counting = false;
  let selectedChar = 0;
  let currentFace = null;
  let liveFace = null;
  let liveDetected = false;
  let liveTimer = 0;
  let animTime = 0;
  let onDoneCallback = null;

  function initUI() {
    root = $('selfieModal');
    if (!root) return;
    video = $('selfieVideo');
    shot = $('selfieShot');
    countdownEl = $('selfieCountdown');
    flashEl = $('selfieFlash');
    camMsg = $('selfieCamMsg');
    faceStatus = $('selfieFaceStatus');
    btnPhoto = $('selfieBtnPhoto');
    btnRetake = $('selfieBtnRetake');
    btnNoPhoto = $('selfieBtnNoPhoto');
    btnOk = $('selfieBtnOk');
    btnClose = $('selfieBtnClose');
    fileInput = $('selfieFileInput');
    charGrid = $('selfieCharGrid');
    nameInput = $('selfieNameInput');
    previewCanvas = $('selfiePreviewCanvas');
    if (previewCanvas) pctx = previewCanvas.getContext('2d');

    // Event listeners
    if (btnPhoto) btnPhoto.onclick = takePhoto;
    if (btnRetake) btnRetake.onclick = retake;
    if (btnNoPhoto) btnNoPhoto.onclick = clearPhoto;
    if (btnOk) btnOk.onclick = saveAndClose;
    if (btnClose) btnClose.onclick = close;

    if (fileInput) {
      fileInput.onchange = () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = async () => {
          if (FaceCut.status === 'loading') await FaceCut.load();
          const r = FaceCut.fromImage(img, true);
          if (r && r.face) {
            currentFace = r.face;
            camMsg.textContent = r.detected ? '✅ ¡Cara detectada en la foto!' : '⚠️ Se ha usado el centro de la imagen.';
          } else {
            camMsg.textContent = 'No se pudo detectar cara en la imagen.';
          }
          URL.revokeObjectURL(img.src);
          playSfx('shutter');
          refreshShot();
        };
        img.src = URL.createObjectURL(file);
        fileInput.value = '';
      };
    }

    if (nameInput) {
      nameInput.oninput = () => {
        nameInput.value = nameInput.value.toUpperCase().slice(0, 8);
      };
      nameInput.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); saveAndClose(); }
        else if (e.key === 'Escape') close();
      };
    }

    // Llenar cuadrícula de personajes
    buildCharCards();
  }

  function playSfx(type) {
    try {
      if (typeof Sound !== 'undefined') {
        if (type === 'beep') {
          // Bip estilo semáforo Lakitu
          if (Sound.ctx) {
            const osc = Sound.ctx.createOscillator();
            const g = Sound.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, Sound.ctx.currentTime);
            g.gain.setValueAtTime(0.2, Sound.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, Sound.ctx.currentTime + 0.15);
            osc.connect(g); g.connect(Sound.ctx.destination);
            osc.start(); osc.stop(Sound.ctx.currentTime + 0.15);
          } else Sound.play('sfx_menumove');
        } else if (type === 'beepHigh') {
          if (Sound.ctx) {
            const osc = Sound.ctx.createOscillator();
            const g = Sound.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, Sound.ctx.currentTime);
            g.gain.setValueAtTime(0.25, Sound.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, Sound.ctx.currentTime + 0.3);
            osc.connect(g); g.connect(Sound.ctx.destination);
            osc.start(); osc.stop(Sound.ctx.currentTime + 0.3);
          } else Sound.play('sfx_coin');
        } else if (type === 'shutter') {
          Sound.play('sfx_item');
        } else if (type === 'confirm') {
          Sound.play('sfx_menuselect');
        }
      }
    } catch (e) {}
  }

  function buildCharCards() {
    if (!charGrid) return;
    charGrid.innerHTML = '';
    CHARACTERS.forEach((ch, idx) => {
      const card = document.createElement('div');
      card.className = 'smk-char-card' + (idx === selectedChar ? ' selected' : '');
      const theme = FaceDriver.themes[idx] || FaceDriver.themes[0];
      card.style.setProperty('--card-color', theme.border);

      card.innerHTML = `
        <span class="char-dot" style="background:${theme.border}"></span>
        <b class="char-name">${ch.name.toUpperCase()}</b>
        <span class="char-type">${ch.type}</span>
      `;
      card.onclick = () => {
        selectedChar = idx;
        playSfx('beep');
        if (nameInput && (!nameInput.value || nameInput.value === CHARACTERS[selectedChar].name.toUpperCase())) {
          nameInput.placeholder = ch.name.toUpperCase();
        }
        buildCharCards();
      };
      charGrid.appendChild(card);
    });
  }

  async function startCamera() {
    if (stream) return;
    camMsg.textContent = 'Iniciando cámara…';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camMsg.textContent = 'Cámara no disponible en este navegador o contexto. Puedes subir una foto con el botón de abajo.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      if (!active) { stopCamera(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      camOK = true;
      camMsg.textContent = '';
    } catch (e) {
      camOK = false;
      camMsg.textContent = 'No se pudo acceder a la cámara (' + (e.name || 'error') + '). Sube una imagen con el botón abajo.';
    }
    refreshShot();
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    camOK = false;
    if (video) video.srcObject = null;
  }

  function open(cb) {
    initUI();
    if (!root) return;
    onDoneCallback = cb;
    active = true;
    selectedChar = Game.playerChar || 0;
    currentFace = FaceDriver.faceCanvas;
    if (nameInput) {
      nameInput.value = FaceDriver.active ? FaceDriver.pilotName : '';
      nameInput.placeholder = CHARACTERS[selectedChar].name.toUpperCase();
    }
    buildCharCards();
    root.classList.remove('hidden');

    // Cargar MediaPipe si no está cargado
    FaceCut.load();
    startCamera();
    refreshShot();
    requestAnimationFrame(previewLoop);
  }

  function close() {
    active = false;
    if (root) root.classList.add('hidden');
    stopCamera();
    if (onDoneCallback) {
      onDoneCallback();
      onDoneCallback = null;
    }
  }

  function refreshShot() {
    const hasShot = !!currentFace;
    if (shot) shot.style.display = hasShot ? 'block' : 'none';
    const oval = root ? root.querySelector('.selfie-oval') : null;
    if (oval) oval.style.display = hasShot ? 'none' : 'block';

    if (hasShot && shot) {
      const s = shot.getContext('2d');
      s.clearRect(0, 0, shot.width, shot.height);
      s.drawImage(currentFace, 10, 10, shot.width - 20, shot.height - 20);
    }
    if (btnPhoto) btnPhoto.disabled = !camOK || counting;
    if (btnRetake) btnRetake.disabled = !hasShot;
  }

  function takePhoto() {
    if (!camOK || counting) return;
    currentFace = null;
    refreshShot();
    counting = true;
    btnPhoto.disabled = true;

    let n = 3;
    countdownEl.textContent = n;
    playSfx('beep');

    const iv = setInterval(() => {
      n--;
      if (n > 0) {
        countdownEl.textContent = n;
        playSfx('beep');
        return;
      }
      clearInterval(iv);
      countdownEl.textContent = '¡SONRÍE!';
      playSfx('beepHigh');
      captureWithRetry(25, performance.now() + 8000);
    }, 700);
  }

  function captureWithRetry(tries, deadline) {
    if (!active) { counting = false; return; }
    if (FaceCut.status === 'loading' && performance.now() < deadline) {
      countdownEl.textContent = '⏳';
      setTimeout(() => captureWithRetry(tries, deadline), 200);
      return;
    }
    countdownEl.textContent = '';
    const strict = FaceCut.status === 'ready' && tries > 0;
    const r = FaceCut.fromVideo(video, !strict);
    if (!r) {
      setTimeout(() => captureWithRetry(tries - 1, deadline), 60);
      return;
    }
    counting = false;
    currentFace = r.face;
    playSfx('shutter');

    if (flashEl) {
      flashEl.classList.add('flash-on');
      setTimeout(() => flashEl.classList.remove('flash-on'), 100);
    }

    if (!r.detected && FaceCut.status === 'ready') {
      camMsg.textContent = 'Cara recortada con óvalo. Si quieres repetir, mira fijamente a la cámara.';
    } else {
      camMsg.textContent = '';
    }
    refreshShot();
  }

  function retake() {
    camMsg.textContent = '';
    currentFace = null;
    refreshShot();
  }

  function clearPhoto() {
    currentFace = null;
    FaceDriver.clearFace();
    playSfx('confirm');
    refreshShot();
  }

  function saveAndClose() {
    playSfx('confirm');
    const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : CHARACTERS[selectedChar].name;
    Game.playerChar = selectedChar;

    if (currentFace) {
      FaceDriver.setFace(currentFace, selectedChar, name, true);
    } else {
      FaceDriver.clearFace();
    }
    close();
  }

  /* Bucle de actualización y dibujo de la vista previa del kart */
  function previewLoop(timestamp) {
    if (!active) return;
    animTime += 0.016;
    liveTimer -= 0.016;

    // Detección en vivo si no hay foto tomada
    if (!currentFace && camOK && video && video.readyState >= 2 && liveTimer <= 0) {
      const r = FaceCut.fromVideo(video, FaceCut.status === 'failed');
      if (r) {
        liveFace = r.face;
        liveDetected = r.detected;
      } else {
        liveFace = null;
        liveDetected = false;
      }
      liveTimer = 0.12;
    }

    // Actualizar texto de estado
    updateStatusText();

    // Dibujar preview del kart
    drawKartPreview();

    requestAnimationFrame(previewLoop);
  }

  function updateStatusText() {
    if (!faceStatus) return;
    const st = FaceCut.status;
    let txt = '', cls = '';

    if (st === 'loading' || st === 'idle') {
      txt = '⏳ Cargando detector de caras con IA…';
    } else if (st === 'failed') {
      txt = '⚠️ Recorte de cara con óvalo retro activo';
      cls = 'warn';
    } else if (currentFace) {
      txt = '✂️ ¡Cara recortada y lista para el kart!';
      cls = 'ok';
    } else if (!camOK) {
      txt = '📷 Esperando cámara o archivo de imagen';
    } else if (liveDetected) {
      txt = '✅ ¡Cara detectada! Pulsa "Hacer foto"';
      cls = 'ok';
    } else {
      txt = '👀 Centra tu rostro en el óvalo…';
      cls = 'warn';
    }

    faceStatus.textContent = txt;
    faceStatus.className = 'selfie-face-status ' + cls;
  }

  function drawKartPreview() {
    if (!pctx || !previewCanvas) return;
    const w = previewCanvas.width, h = previewCanvas.height;
    pctx.clearRect(0, 0, w, h);

    // Fondo estilo garaje de Super Mario Kart
    pctx.fillStyle = '#181828';
    pctx.fillRect(0, 0, w, h);

    // Plataforma giratoria
    const cx = w / 2, cy = h * 0.72;
    pctx.fillStyle = '#303050';
    pctx.beginPath();
    pctx.ellipse(cx, cy + 28, 70, 18, 0, 0, Math.PI * 2);
    pctx.fill();
    pctx.strokeStyle = '#f8d020';
    pctx.lineWidth = 2;
    pctx.stroke();

    // Sombra del kart
    pctx.fillStyle = 'rgba(0,0,0,0.5)';
    pctx.beginPath();
    pctx.ellipse(cx, cy + 22, 45, 12, 0, 0, Math.PI * 2);
    pctx.fill();

    // Ángulo de giro de la plataforma (360° en ~5 segundos)
    const angle = (animTime * 1.5) % (Math.PI * 2);

    // Obtener sprite del kart en este ángulo
    const ch = CHARACTERS[selectedChar];
    const anim = new Animator(ch.file.replace('drivers/', ''));

    // Si hay cara activa o foto temporal, aplicar temporalmente
    const faceToUse = currentFace || liveFace;
    if (faceToUse) {
      const tempFrames = FaceDriver.buildDrivingFrames(selectedChar);
      if (tempFrames) anim.driving = tempFrames;
    }

    const mf = anim.minimapFrame(angle);
    const sprite = anim.driving[mf.frame];

    const kartSize = 80;
    pctx.save();
    pctx.imageSmoothingEnabled = false;
    pctx.translate(cx, cy);

    // Pequeño bamboleo de motor
    const bob = Math.sin(animTime * 18) * 1.5;
    pctx.translate(0, bob);

    if (mf.mirror) pctx.scale(-1, 1);
    pctx.drawImage(sprite, -kartSize / 2, -kartSize + 15, kartSize, kartSize);
    pctx.restore();

    // Texto de nombre del piloto y personaje
    pctx.fillStyle = '#ffe060';
    pctx.font = 'bold 15px monospace';
    pctx.textAlign = 'center';
    const dName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim().toUpperCase() : ch.name.toUpperCase();
    pctx.fillText('PILOTO: ' + dName, cx, 24);

    pctx.fillStyle = '#a0d0ff';
    pctx.font = '11px monospace';
    pctx.fillText('KART: ' + ch.name.toUpperCase() + ' (' + ch.type + ')', cx, 40);
  }

  return {
    initUI,
    open,
    close,
    get active() { return active; }
  };
})();
