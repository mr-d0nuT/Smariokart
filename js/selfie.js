/* ============================================================
 * Süper Mario Kart Web - Selfie & Pilot Setup Modal
 * Reutiliza las funciones de captura y recorte de cara (FaceCut)
 * con soporte para FOTO FRONTAL (cara) y FOTO TRASERA (nuca/pelo),
 * en MÁXIMA CALIDAD FOTOGRÁFICA y tamaño cabezón exagerado.
 * ============================================================ */
'use strict';

const SelfieSetup = (() => {
  const $ = id => document.getElementById(id);
  let root, video, shot, countdownEl, flashEl, camMsg, faceStatus;
  let btnPhoto, btnRetake, btnNoPhoto, btnOk, btnClose, fileInput;
  let tabFront, tabBack, badgeFront, badgeBack, thumbFront, thumbBack;
  let charGrid, nameInput, previewCanvas, pctx;
  let camBox, framingControls, zoomSlider, zoomBadge, btnZoomIn, btnZoomOut, btnCenterHead;

  let stream = null;
  let camOK = false;
  let active = false;
  let counting = false;
  let selectedChar = 0;
  let photoMode = 'front';          // 'front' | 'back'
  let liveView = true;              // true: live camera feed, false: viewing/framing captured shot
  let currentFace = null;           // Foto frontal HD
  let currentBack = null;           // Foto trasera HD (nuca / pelo por detrás)
  let rawFrontCanvas = null;        // Captura original sin recortar frontal
  let rawBackCanvas = null;         // Captura original sin recortar trasera
  let cropFront = { cx: 0.5, cy: 0.5, zoom: 1.0, isContour: false };
  let cropBack = { cx: 0.5, cy: 0.62, zoom: 1.35 };
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let cropStartCx = 0.5, cropStartCy = 0.5;

  let liveFace = null;
  let liveDetected = false;
  let liveTimer = 0;
  let animTime = 0;
  let onDoneCallback = null;
  let _lastFace = null;
  let _lastBack = null;
  let _lastChar = -1;
  let previewAnim = null;
  let previewAnimChar = -1;

  function getCurrentCrop() {
    return photoMode === 'front' ? cropFront : cropBack;
  }

  function getActiveRaw() {
    return photoMode === 'front' ? rawFrontCanvas : rawBackCanvas;
  }

  function applyZoom(z) {
    const cr = getCurrentCrop();
    cr.zoom = Math.max(0.7, Math.min(2.6, Math.round(z * 100) / 100));
    if (zoomSlider) zoomSlider.value = cr.zoom;
    if (zoomBadge) zoomBadge.textContent = Math.round(cr.zoom * 100) + '%';
    updateActiveCrop(true);
  }

  function autoCenterCurrent() {
    const raw = getActiveRaw();
    const cr = getCurrentCrop();
    if (photoMode === 'back') {
      if (raw) {
        const auto = FaceCut.autoDetectHeadCenter(raw);
        cr.cx = auto.cx;
        cr.cy = auto.cy;
        cr.zoom = auto.zoom;
      } else {
        cr.cx = 0.50; cr.cy = 0.62; cr.zoom = 1.35;
      }
      if (camMsg) camMsg.textContent = '🎯 Nuca centrada automáticamente. Arrastra o usa zoom para afinar.';
    } else {
      cr.cx = 0.5; cr.cy = 0.5; cr.zoom = 1.0;
      if (camMsg) camMsg.textContent = '🎯 Rostro centrado.';
    }
    if (zoomSlider) zoomSlider.value = cr.zoom;
    if (zoomBadge) zoomBadge.textContent = Math.round(cr.zoom * 100) + '%';
    updateActiveCrop(true);
  }

  function onDragStart(e) {
    const raw = getActiveRaw();
    if (!raw) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const cr = getCurrentCrop();
    cropStartCx = cr.cx;
    cropStartCy = cr.cy;
    if (camBox) camBox.classList.add('is-dragging');
  }

  function onTouchStart(e) {
    const raw = getActiveRaw();
    if (!raw || !e.touches || !e.touches[0]) return;
    isDragging = true;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    const cr = getCurrentCrop();
    cropStartCx = cr.cx;
    cropStartCy = cr.cy;
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const raw = getActiveRaw();
    if (!raw) return;
    const cr = getCurrentCrop();
    const W = raw.width || 320, H = raw.height || 320;
    const side = (Math.min(W, H) * 0.82) / cr.zoom;
    const k = (shot ? shot.width : 320) / side;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    cr.cx = Math.max(0.05, Math.min(0.95, cropStartCx - dx / (W * k)));
    cr.cy = Math.max(0.05, Math.min(0.95, cropStartCy - dy / (H * k)));
    updateActiveCrop(false);
  }

  function onTouchMove(e) {
    if (!isDragging || !e.touches || !e.touches[0]) return;
    const raw = getActiveRaw();
    if (!raw) return;
    const cr = getCurrentCrop();
    const W = raw.width || 320, H = raw.height || 320;
    const side = (Math.min(W, H) * 0.82) / cr.zoom;
    const k = (shot ? shot.width : 320) / side;
    const dx = e.touches[0].clientX - dragStartX;
    const dy = e.touches[0].clientY - dragStartY;
    cr.cx = Math.max(0.05, Math.min(0.95, cropStartCx - dx / (W * k)));
    cr.cy = Math.max(0.05, Math.min(0.95, cropStartCy - dy / (H * k)));
    updateActiveCrop(false);
  }

  function onDragEnd() {
    if (isDragging) {
      isDragging = false;
      if (camBox) camBox.classList.remove('is-dragging');
      updateActiveCrop(true);
    }
  }

  function drawFramedShot() {
    const raw = getActiveRaw();
    const cr = getCurrentCrop();
    if (!shot) return;
    const s = shot.getContext('2d');
    s.imageSmoothingEnabled = true;
    s.imageSmoothingQuality = 'high';
    // Fondo opaco oscuro sólido para que el vídeo en vivo jamás se transparente por detrás
    s.fillStyle = '#080810';
    s.fillRect(0, 0, shot.width, shot.height);

    if (raw) {
      const W = raw.width || 320, H = raw.height || 320;
      const side = (Math.min(W, H) * 0.82) / cr.zoom;
      const k = shot.width / side;
      const ox = (shot.width / 2) - cr.cx * W * k;
      const oy = (shot.height / 2) - cr.cy * H * k;
      s.drawImage(raw, ox, oy, W * k, H * k);
    } else {
      const activePhoto = (photoMode === 'front') ? currentFace : currentBack;
      if (activePhoto) {
        s.drawImage(activePhoto, 10, 10, shot.width - 20, shot.height - 20);
      }
    }
  }

  function updateActiveCrop(saveToPilot = true) {
    const raw = getActiveRaw();
    const cr = getCurrentCrop();
    if (!raw) return;

    const cut = FaceCut.cropOval(raw, cr.cx, cr.cy, cr.zoom);
    if (photoMode === 'front') {
      currentFace = cut;
      cropFront.isContour = false;
    } else {
      currentBack = cut;
    }

    drawFramedShot();

    if (saveToPilot) {
      updatePilotFrames();
    }
  }

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
    tabFront = $('tabFrontPhoto');
    tabBack = $('tabBackPhoto');
    badgeFront = $('badgeFrontStatus');
    badgeBack = $('badgeBackStatus');
    thumbFront = $('thumbFront');
    thumbBack = $('thumbBack');
    charGrid = $('selfieCharGrid');
    nameInput = $('selfieNameInput');
    previewCanvas = $('selfiePreviewCanvas');
    if (previewCanvas) pctx = previewCanvas.getContext('2d');

    camBox = $('selfieCamBox') || (root ? root.querySelector('.selfie-cam-box') : null);
    framingControls = $('selfieFramingControls');
    zoomSlider = $('selfieZoomSlider');
    zoomBadge = $('zoomValBadge');
    btnZoomIn = $('btnZoomIn');
    btnZoomOut = $('btnZoomOut');
    btnCenterHead = $('btnCenterHead');

    // Event listeners
    if (btnPhoto) btnPhoto.onclick = takePhoto;
    if (btnRetake) btnRetake.onclick = retake;
    if (btnNoPhoto) btnNoPhoto.onclick = clearPhoto;
    if (btnOk) btnOk.onclick = saveAndClose;
    if (btnClose) btnClose.onclick = close;

    if (zoomSlider) {
      zoomSlider.oninput = () => applyZoom(parseFloat(zoomSlider.value));
    }
    if (btnZoomIn) {
      btnZoomIn.onclick = () => {
        const cr = getCurrentCrop();
        applyZoom(cr.zoom + 0.1);
      };
    }
    if (btnZoomOut) {
      btnZoomOut.onclick = () => {
        const cr = getCurrentCrop();
        applyZoom(cr.zoom - 0.1);
      };
    }
    if (btnCenterHead) {
      btnCenterHead.onclick = () => autoCenterCurrent();
    }

    // Arrastre interactivo para encuadrar en el lienzo de foto
    if (shot) {
      shot.onmousedown = onDragStart;
      shot.ontouchstart = onTouchStart;
    }
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onDragEnd);

    // Zoom con la rueda del ratón
    if (camBox) {
      camBox.onwheel = e => {
        if (!getActiveRaw()) return;
        e.preventDefault();
        const cr = getCurrentCrop();
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        applyZoom(cr.zoom + delta);
      };
    }

    if (fileInput) {
      fileInput.onchange = () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        counting = false;
        if (photoMode === 'front') {
          currentFace = null;
          rawFrontCanvas = null;
        } else {
          currentBack = null;
          rawBackCanvas = null;
        }
        if (shot) {
          shot.style.display = 'none';
          const s = shot.getContext('2d');
          if (s) s.clearRect(0, 0, shot.width, shot.height);
        }
        if (video) video.style.visibility = 'visible';
        const img = new Image();
        img.onload = async () => {
          if (FaceCut.status === 'loading') await FaceCut.load();
          const r = FaceCut.fromImage(img, true);
          if (r && (r.face || r.raw)) {
            if (photoMode === 'front') {
              rawFrontCanvas = r.raw;
              currentFace = r.face;
              cropFront = { cx: 0.5, cy: 0.5, zoom: 1.0, isContour: !!r.detected };
              camMsg.textContent = '✅ ¡Foto frontal guardada! Arrastra o usa zoom si quieres afinar.';
            } else {
              rawBackCanvas = r.raw;
              const auto = FaceCut.autoDetectHeadCenter(rawBackCanvas);
              cropBack = { cx: auto.cx, cy: auto.cy, zoom: auto.zoom };
              currentBack = FaceCut.cropOval(rawBackCanvas, cropBack.cx, cropBack.cy, cropBack.zoom);
              camMsg.textContent = '✅ ¡Foto de nuca encuadrada! Arrastra o usa el zoom para afinar.';
            }
          } else {
            camMsg.textContent = 'No se pudo procesar la imagen.';
          }
          URL.revokeObjectURL(img.src);
          liveView = false;
          playSfx('shutter');
          updatePilotFrames();
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

    buildCharCards();
  }

  function switchMode(mode) {
    photoMode = mode;
    if (tabFront) tabFront.classList.toggle('active', mode === 'front');
    if (tabBack) tabBack.classList.toggle('active', mode === 'back');

    if (mode === 'front') {
      camMsg.textContent = currentFace ? 'Mostrando tu foto frontal.' : 'Centra tu rostro mirando a la cámara.';
    } else {
      camMsg.textContent = currentBack
        ? 'Mostrando tu foto trasera (nuca/pelo).'
        : '💡 ¡Ponte de espaldas o gira la cabeza para fotografiar tu nuca o pelo por detrás!';
    }
    refreshShot();
  }

  function playSfx(type) {
    try {
      if (typeof Sound !== 'undefined') {
        if (type === 'beep') {
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
        updatePilotFrames();
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
    currentBack = FaceDriver.backCanvas;
    if (!rawFrontCanvas && currentFace) rawFrontCanvas = currentFace;
    if (!rawBackCanvas && currentBack) rawBackCanvas = currentBack;
    photoMode = 'front';
    liveView = true; // Por defecto siempre muestra la cámara en vivo limpia para enfocar y disparar

    if (nameInput) {
      nameInput.value = FaceDriver.active ? FaceDriver.pilotName : '';
      nameInput.placeholder = CHARACTERS[selectedChar].name.toUpperCase();
    }
    buildCharCards();
    updateHeadgearButton();
    switchMode('front');
    root.classList.remove('hidden');

    FaceCut.load();
    startCamera();
    refreshShot();
    requestAnimationFrame(previewLoop);
  }

  function close() {
    active = false;
    counting = false;
    liveView = true;
    if (countdownEl) countdownEl.textContent = '';
    if (root) root.classList.add('hidden');
    stopCamera();
    if (onDoneCallback) {
      onDoneCallback();
      onDoneCallback = null;
    }
  }

  function refreshShot() {
    const raw = getActiveRaw();
    const activePhoto = (photoMode === 'front') ? currentFace : currentBack;
    const hasCaptured = !liveView && !counting && !!(raw || activePhoto);
    const cr = getCurrentCrop();

    if (shot) {
      shot.style.display = hasCaptured ? 'block' : 'none';
      if (!hasCaptured) {
        const s = shot.getContext('2d');
        if (s) s.clearRect(0, 0, shot.width, shot.height);
      }
    }
    if (video) {
      video.style.visibility = hasCaptured ? 'hidden' : 'visible';
    }
    const oval = root ? root.querySelector('.selfie-oval') : null;
    if (oval) oval.style.display = 'block';

    if (framingControls) {
      if (hasCaptured && raw) {
        framingControls.classList.remove('hidden');
        if (zoomSlider) zoomSlider.value = cr.zoom;
        if (zoomBadge) zoomBadge.textContent = Math.round(cr.zoom * 100) + '%';
      } else {
        framingControls.classList.add('hidden');
      }
    }
    if (camBox) {
      camBox.classList.toggle('can-drag', !!(hasCaptured && raw));
    }

    if (hasCaptured) {
      drawFramedShot();
    }

    // Actualizar insignias de fotos listas
    if (badgeFront) {
      badgeFront.textContent = currentFace ? '✅ Lista' : '⚪ Pendiente';
      if (thumbFront) thumbFront.classList.toggle('done', !!currentFace);
    }
    if (badgeBack) {
      badgeBack.textContent = currentBack ? '✅ Lista' : '⚪ Opcional';
      if (thumbBack) thumbBack.classList.toggle('done', !!currentBack);
    }

    if (btnPhoto) btnPhoto.disabled = !camOK || counting;
    if (btnRetake) btnRetake.disabled = !hasCaptured;
  }

  function updatePilotFrames() {
    _lastFace = null;
    if (currentFace) {
      const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : CHARACTERS[selectedChar].name;
      FaceDriver.setFace(currentFace, currentBack, selectedChar, name, false);
      if (previewAnim) {
        FaceDriver.applyToAnimator(previewAnim, selectedChar);
      }
    }
  }

  function takePhoto() {
    if (!camOK || counting) return;
    // Limpiar completamente la foto anterior para que NADA se interponga ante la cámara en vivo
    if (photoMode === 'front') {
      currentFace = null;
      rawFrontCanvas = null;
    } else {
      currentBack = null;
      rawBackCanvas = null;
    }
    counting = true;
    if (btnPhoto) btnPhoto.disabled = true;

    // Asegurar que el lienzo de la foto anterior quede oculto y limpio de inmediato
    if (shot) {
      shot.style.display = 'none';
      const s = shot.getContext('2d');
      if (s) s.clearRect(0, 0, shot.width, shot.height);
    }
    if (video) video.style.visibility = 'visible';
    if (framingControls) framingControls.classList.add('hidden');
    if (camBox) camBox.classList.remove('can-drag');

    refreshShot();

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
      countdownEl.textContent = photoMode === 'front' ? '¡SONRÍE!' : '¡QUIETO!';
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
      if (tries <= 0 || performance.now() >= deadline) {
        counting = false;
        if (camMsg) camMsg.textContent = 'No se pudo capturar la foto. Pulsa "Hacer foto" para intentarlo de nuevo.';
        refreshShot();
        return;
      }
      setTimeout(() => captureWithRetry(tries - 1, deadline), 60);
      return;
    }
    counting = false;
    liveView = false; // Foto recién hecha: ahora se muestra el lienzo para encuadrar y afinar

    if (photoMode === 'front') {
      rawFrontCanvas = r.raw;
      currentFace = r.face;
      cropFront = { cx: 0.5, cy: 0.5, zoom: 1.0, isContour: !!r.detected };
      camMsg.textContent = '✅ ¡Cara frontal capturada en alta resolución! Arrastra o usa zoom si quieres afinar.';
    } else {
      rawBackCanvas = r.raw;
      const auto = FaceCut.autoDetectHeadCenter(rawBackCanvas);
      cropBack = { cx: auto.cx, cy: auto.cy, zoom: auto.zoom };
      currentBack = FaceCut.cropOval(rawBackCanvas, cropBack.cx, cropBack.cy, cropBack.zoom);
      camMsg.textContent = '✅ ¡Foto trasera de tu nuca encuadrada! Arrastra o usa el zoom para afinar.';
    }

    playSfx('shutter');

    if (flashEl) {
      flashEl.classList.add('flash-on');
      setTimeout(() => flashEl.classList.remove('flash-on'), 100);
    }

    updatePilotFrames();
    refreshShot();
  }

  function retake() {
    camMsg.textContent = '';
    counting = false;
    liveView = true; // Volver a la cámara en vivo limpia
    if (countdownEl) countdownEl.textContent = '';
    _lastFace = null;
    if (photoMode === 'front') {
      currentFace = null;
      rawFrontCanvas = null;
      cropFront = { cx: 0.5, cy: 0.5, zoom: 1.0, isContour: false };
    } else {
      currentBack = null;
      rawBackCanvas = null;
      cropBack = { cx: 0.5, cy: 0.62, zoom: 1.35 };
    }
    if (shot) {
      shot.style.display = 'none';
      const s = shot.getContext('2d');
      if (s) s.clearRect(0, 0, shot.width, shot.height);
    }
    if (video) video.style.visibility = 'visible';
    updatePilotFrames();
    refreshShot();
  }

  function clearPhoto() {
    counting = false;
    liveView = true;
    if (countdownEl) countdownEl.textContent = '';
    currentFace = null;
    currentBack = null;
    rawFrontCanvas = null;
    rawBackCanvas = null;
    _lastFace = null;
    _lastBack = null;
    _lastChar = -1;
    previewAnim = null;
    previewAnimChar = -1;
    cropFront = { cx: 0.5, cy: 0.5, zoom: 1.0, isContour: false };
    cropBack = { cx: 0.5, cy: 0.62, zoom: 1.35 };
    if (shot) {
      shot.style.display = 'none';
      const s = shot.getContext('2d');
      if (s) s.clearRect(0, 0, shot.width, shot.height);
    }
    if (video) video.style.visibility = 'visible';
    FaceDriver.clearFace();
    playSfx('confirm');
    refreshShot();
  }

  function saveAndClose() {
    playSfx('confirm');
    const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : CHARACTERS[selectedChar].name;
    Game.playerChar = selectedChar;

    if (currentFace) {
      FaceDriver.setFace(currentFace, currentBack, selectedChar, name, true);
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

    // Detección en vivo si estamos en frontal y aún no hay foto tomada
    if (photoMode === 'front' && !currentFace && camOK && video && video.readyState >= 2 && liveTimer <= 0) {
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

    updateStatusText();
    drawKartPreview();
    requestAnimationFrame(previewLoop);
  }

  function updateStatusText() {
    if (!faceStatus) return;
    const st = FaceCut.status;
    let txt = '', cls = '';

    if (st === 'loading' || st === 'idle') {
      txt = '⏳ Cargando detector de caras con IA…';
    } else if (currentFace && currentBack) {
      txt = '🌟 ¡Piloto completo en MÁXIMA CALIDAD! (Frontal y Nuca listas)';
      cls = 'ok';
    } else if (currentFace) {
      txt = '✂️ Cara frontal lista. ¡Recuerda hacerte la foto por detrás (nuca)!';
      cls = 'ok';
    } else if (!camOK) {
      txt = '📷 Esperando cámara o archivo de imagen';
    } else if (liveDetected) {
      txt = '✅ ¡Cara detectada! Pulsa "Hacer foto (3s)"';
      cls = 'ok';
    } else {
      txt = photoMode === 'front' ? '👀 Centra tu rostro en el óvalo…' : '🔙 Coloca tu nuca/pelo en el óvalo…';
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
    pctx.ellipse(cx, cy + 28, 90, 24, 0, 0, Math.PI * 2);
    pctx.fill();
    pctx.strokeStyle = '#f8d020';
    pctx.lineWidth = 2;
    pctx.stroke();

    // Sombra del kart
    pctx.fillStyle = 'rgba(0,0,0,0.5)';
    pctx.beginPath();
    pctx.ellipse(cx, cy + 22, 60, 16, 0, 0, Math.PI * 2);
    pctx.fill();

    // Ángulo de giro de la plataforma (360° en ~5 segundos)
    const angle = (animTime * 1.5) % (Math.PI * 2);

    // Obtener sprite del kart en este ángulo
    const ch = CHARACTERS[selectedChar];
    if (!previewAnim || previewAnimChar !== selectedChar) {
      previewAnimChar = selectedChar;
      previewAnim = new Animator(ch.file.replace('drivers/', ''));
      _lastFace = null;
    }

    // Si hay fotos listas (capturada o en vivo), aplicar rostro inmediatamente
    const faceToUse = currentFace || liveFace;
    if (faceToUse) {
      if (_lastFace !== faceToUse || _lastBack !== currentBack || _lastChar !== selectedChar) {
        _lastFace = faceToUse;
        _lastBack = currentBack;
        _lastChar = selectedChar;
        FaceDriver.setFace(faceToUse, currentBack, selectedChar, ch.name, false);
        FaceDriver.applyToAnimator(previewAnim, selectedChar);
      }
    } else if (_lastFace !== null) {
      _lastFace = null;
      _lastBack = null;
      _lastChar = selectedChar;
      previewAnim = new Animator(ch.file.replace('drivers/', ''));
    }

    const mf = previewAnim.minimapFrame(angle);
    const sprite = (previewAnim.driving && previewAnim.driving[mf.frame]) ? previewAnim.driving[mf.frame] : null;

    if (sprite) {
      const kartSize = 140; // Tamaño ampliado para lucir la cabeza grande en el preview
      pctx.save();
      pctx.imageSmoothingEnabled = true;
      pctx.imageSmoothingQuality = 'high';
      pctx.translate(cx, cy);

      // Pequeño bamboleo de motor
      const bob = Math.sin(animTime * 18) * 1.5;
      pctx.translate(0, bob);

      if (mf.mirror) pctx.scale(-1, 1);
      pctx.drawImage(sprite, -kartSize / 2, -kartSize + 22, kartSize, kartSize);
      pctx.restore();
    }

    // Texto de nombre del piloto y personaje
    pctx.fillStyle = '#ffe060';
    pctx.font = 'bold 15px monospace';
    pctx.textAlign = 'center';
    const dName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim().toUpperCase() : ch.name.toUpperCase();
    pctx.fillText('PILOTO: ' + dName, cx, 24);

    pctx.fillStyle = '#a0d0ff';
    pctx.font = '11px monospace';
    pctx.fillText(ch.name.toUpperCase() + ' · ' + ch.type.toUpperCase(), cx, 40);
  }

  function toggleHeadgear() {
    if (typeof FaceDriver === 'undefined') return;
    const current = FaceDriver.wearHeadgear;
    FaceDriver.setWearHeadgear(!current);
    updateHeadgearButton();
    // Forzar reconstrucción de fotogramas del preview
    _lastFace = null;
    const ch = CHARACTERS[selectedChar];
    const faceToUse = currentFace || liveFace;
    if (faceToUse) {
      FaceDriver.setFace(faceToUse, currentBack, selectedChar, ch.name, false);
      if (previewAnim) {
        FaceDriver.applyToAnimator(previewAnim, selectedChar);
      }
    }
  }

  function updateHeadgearButton() {
    const btn = document.getElementById('selfieBtnToggleHeadgear');
    if (!btn || typeof FaceDriver === 'undefined') return;
    const isWearing = FaceDriver.wearHeadgear;
    btn.textContent = isWearing ? '🧢 Accesorio: CON GORRA' : '🧑 Accesorio: SIN GORRA (CARA LIMPIA)';
    btn.style.borderColor = isWearing ? '#00d2ff' : '#ffd700';
  }

  return {
    initUI,
    open,
    close,
    switchMode,
    toggleHeadgear,
    drawKartPreview,
    saveAndClose,
    selectChar: (idx) => { selectedChar = idx; updatePilotFrames(); buildCharCards(); },
    get currentFace() { return currentFace; },
    get currentBack() { return currentBack; },
    get selectedChar() { return selectedChar; }
  };
})();
