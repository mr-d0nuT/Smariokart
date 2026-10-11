'use strict';
const FACE_SIZE = 256;
// Recorte automático de la cara con MediaPipe Face Landmarker (se ejecuta en el navegador).
// Detecta los 478 puntos de la cara, se queda con el contorno (óvalo facial) y elimina el fondo.
// Si no se puede cargar (sin conexión, navegador antiguo…), se usa un óvalo difuminado.
const FaceCut = (() => {
  const VER = '0.10.14';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  // Índices del contorno de la cara en la malla de MediaPipe (FACEMESH_FACE_OVAL), en orden.
  const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
    152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

  let landmarker = null, loading = null, attempts = 0;
  let status = 'idle'; // idle | loading | ready | failed
  let lastTs = 0;
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: false });

  function load() {
    if (loading) return loading;
    status = 'loading';
    loading = (async () => {
      try {
        const vision = await import(`${CDN}/vision_bundle.mjs`);
        const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
        const make = delegate => vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO', numFaces: 1,
        });
        try { landmarker = await make('GPU'); } catch (e) { landmarker = await make('CPU'); }
        status = 'ready';
      } catch (e) {
        console.warn('FaceCut: no se pudo cargar el detector de caras', e);
        landmarker = null;
        attempts++;
        // red inestable: se reintenta solo un par de veces antes de rendirse
        if (attempts < 3) {
          loading = null;
          await new Promise(r => setTimeout(r, 2000));
          return load();
        }
        status = 'failed';
        loading = null; attempts = 0; // se podrá reintentar al volver a la pantalla de foto
      }
      return landmarker;
    })();
    return loading;
  }

  // Copia la fuente (vídeo o imagen) a un lienzo de trabajo, opcionalmente en espejo.
  function toWork(src, w, h, mirror) {
    const k = Math.min(1, 720 / Math.max(w, h));
    work.width = Math.round(w * k); work.height = Math.round(h * k);
    wctx.save();
    if (mirror) { wctx.translate(work.width, 0); wctx.scale(-1, 1); }
    wctx.drawImage(src, 0, 0, work.width, work.height);
    wctx.restore();
  }

  function detect() {
    if (!landmarker) return null;
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    try {
      const r = landmarker.detectForVideo(work, ts);
      return (r && r.faceLandmarks && r.faceLandmarks[0]) || null;
    } catch (e) { return null; }
  }

  function polyPath(c, pts) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
  }

  // Recorta la cara del lienzo de trabajo siguiendo el contorno y la centra en un lienzo FACE_SIZE.
  function cutFromWork(lms) {
    const W = work.width, H = work.height;
    let pts = OVAL.map(i => ({ x: lms[i].x * W, y: lms[i].y * H }));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    // un pelín más grande (incluye algo de frente/flequillo y la barbilla entera)
    pts = pts.map(p => ({ x: cx + (p.x - cx) * 1.06, y: cy + (p.y - cy) * (p.y < cy ? 1.12 : 1.04) }));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const S = FACE_SIZE;
    const k = (S * 0.96) / Math.max(maxX - minX, maxY - minY);
    const ox = S / 2 - ((minX + maxX) / 2) * k, oy = S / 2 - ((minY + maxY) / 2) * k;
    const tp = pts.map(p => ({ x: p.x * k + ox, y: p.y * k + oy }));

    const out = document.createElement('canvas');
    out.width = out.height = S;
    const o = out.getContext('2d');
    o.filter = 'contrast(1.15) saturate(1.3) brightness(1.05)';
    o.drawImage(work, ox, oy, W * k, H * k);
    o.filter = 'none';
    // Máscara con borde suave difuminado profesional (sin trazos rígidos ni halos)
    const mask = document.createElement('canvas');
    mask.width = mask.height = S;
    const m = mask.getContext('2d');
    m.filter = 'blur(3px)';
    m.fillStyle = '#000';
    polyPath(m, tp); m.fill();
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(mask, 0, 0);
    o.globalCompositeOperation = 'source-over';
    out._cut = true;
    out._skinColor = '#f0c8a0';
    out._hairColor = '#3a2010';
    try {
      const sample = o.getImageData(S / 2 - 8, S / 2 - 8, 16, 16);
      if (sample && sample.data) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < sample.data.length; i += 4) {
          if (sample.data[i + 3] > 180) {
            r += sample.data[i]; g += sample.data[i + 1]; b += sample.data[i + 2]; count++;
          }
        }
        if (count > 0) out._skinColor = `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
      }
    } catch(e) {}
    return out;
  }

  // Copia del lienzo de trabajo sin recortar
  function getRawWork() {
    const raw = document.createElement('canvas');
    raw.width = work.width; raw.height = work.height;
    const rctx = raw.getContext('2d');
    rctx.drawImage(work, 0, 0);
    return raw;
  }

  // Recorte de óvalo en cualquier coordenada (cx, cy) y zoom con máscara suave profesional.
  function cropOval(sourceCanvas, cx = 0.5, cy = 0.5, zoom = 1.0, S = FACE_SIZE) {
    if (!sourceCanvas) return null;
    const W = sourceCanvas.width || sourceCanvas.naturalWidth || 320;
    const H = sourceCanvas.height || sourceCanvas.naturalHeight || 320;
    const z = Math.max(0.4, Math.min(3.5, zoom || 1.0));
    const side = (Math.min(W, H) * 0.82) / z;
    const k = S / side;
    const ox = (S / 2) - cx * W * k;
    const oy = (S / 2) - cy * H * k;

    const out = document.createElement('canvas');
    out.width = out.height = S;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    o.filter = 'contrast(1.10) saturate(1.20) brightness(1.03)';
    o.drawImage(sourceCanvas, ox, oy, W * k, H * k);
    o.filter = 'none';

    // Máscara ovalada suave difuminada profesional
    const mask = document.createElement('canvas');
    mask.width = mask.height = S;
    const m = mask.getContext('2d');
    m.filter = 'blur(3.5px)';
    m.fillStyle = '#000';
    m.beginPath();
    m.ellipse(S / 2, S / 2, S * 0.38, S * 0.46, 0, 0, Math.PI * 2);
    m.fill();

    o.globalCompositeOperation = 'destination-in';
    o.drawImage(mask, 0, 0);
    o.globalCompositeOperation = 'source-over';

    out._cut = 'oval';
    out._crop = { cx, cy, zoom: z };
    out._skinColor = '#f0c8a0';
    out._hairColor = '#3a2010';
    try {
      const sample = o.getImageData(S / 2 - 8, S / 2 - 8, 16, 16);
      if (sample && sample.data) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < sample.data.length; i += 4) {
          if (sample.data[i + 3] > 180) {
            r += sample.data[i]; g += sample.data[i + 1]; b += sample.data[i + 2]; count++;
          }
        }
        if (count > 0) out._skinColor = `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
      }
    } catch(e) {}
    return out;
  }

  // Detección automática del centro de la cabeza/pelo en fotos de nuca o espalda
  function autoDetectHeadCenter(sourceCanvas) {
    if (!sourceCanvas) return { cx: 0.5, cy: 0.62, zoom: 1.35 };
    try {
      const W = sourceCanvas.width || sourceCanvas.naturalWidth || 0;
      const H = sourceCanvas.height || sourceCanvas.naturalHeight || 0;
      if (!W || !H) return { cx: 0.5, cy: 0.62, zoom: 1.35 };

      const tw = 48, th = 48;
      const thumb = document.createElement('canvas');
      thumb.width = tw; thumb.height = th;
      const tctx = thumb.getContext('2d');
      tctx.drawImage(sourceCanvas, 0, 0, tw, th);
      const imgData = tctx.getImageData(0, 0, tw, th);
      const d = imgData.data;

      // Estimar color del fondo (filas superiores: pared, techo, etc.)
      let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < tw; x++) {
          const idx = (y * tw + x) * 4;
          bgR += d[idx]; bgG += d[idx + 1]; bgB += d[idx + 2];
          bgCount++;
        }
      }
      bgR /= bgCount; bgG /= bgCount; bgB /= bgCount;

      // Centro de masas de los píxeles que difieren del fondo (pelo, cabeza, nuca)
      let sumX = 0, sumY = 0, weightSum = 0;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const idx = (y * tw + x) * 4;
          const dr = d[idx] - bgR;
          const dg = d[idx + 1] - bgG;
          const db = d[idx + 2] - bgB;
          const diff = Math.sqrt(dr * dr + dg * dg + db * db);
          // Ponderar hacia el centro horizontal
          const centerDist = Math.abs(x - tw / 2) / (tw / 2);
          const weight = diff * (1.0 - 0.35 * centerDist);
          sumX += x * weight;
          sumY += y * weight;
          weightSum += weight;
        }
      }

      if (weightSum > 10) {
        const detectedCx = Math.max(0.35, Math.min(0.65, (sumX / weightSum) / tw));
        const detectedCy = Math.max(0.45, Math.min(0.75, (sumY / weightSum) / th));
        return { cx: detectedCx, cy: detectedCy, zoom: 1.35 };
      }
    } catch (e) {
      // Ignorar si el contexto no permite getImageData
    }
    return { cx: 0.50, cy: 0.62, zoom: 1.35 };
  }

  // Alternativa sin detector: óvalo central con borde difuminado.
  function ovalFallback() {
    return cropOval(work, 0.5, 0.5, 1.0, FACE_SIZE);
  }

  // Devuelve { face, raw, detected } o null si la fuente aún no tiene imagen.
  function fromSource(src, w, h, mirror, allowFallback = true) {
    if (!w || !h) return null;
    toWork(src, w, h, mirror);
    const raw = getRawWork();
    const lms = detect();
    if (lms) return { face: cutFromWork(lms), raw, detected: true };
    return allowFallback ? { face: ovalFallback(), raw, detected: false } : null;
  }

  return {
    load,
    get status() { return status; },
    fromVideo: (video, allowFallback) => fromSource(video, video.videoWidth, video.videoHeight, true, allowFallback),
    fromImage: (img, allowFallback) => fromSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height, false, allowFallback),
    cropOval,
    autoDetectHeadCenter,
  };
})();
