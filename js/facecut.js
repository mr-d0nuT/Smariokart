'use strict';
const FACE_SIZE = 160;
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
    // máscara con borde suave
    const mask = document.createElement('canvas');
    mask.width = mask.height = S;
    const m = mask.getContext('2d');
    m.filter = 'blur(1.5px)';
    m.fillStyle = '#000';
    polyPath(m, tp); m.fill();
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(mask, 0, 0);
    o.globalCompositeOperation = 'source-over';
    // contorno estilo cómic
    o.strokeStyle = 'rgba(40,20,10,.55)'; o.lineWidth = 2.5; o.lineJoin = 'round';
    polyPath(o, tp); o.stroke();
    out._cut = true;
    return out;
  }

  // Alternativa sin detector: óvalo central con borde difuminado.
  function ovalFallback() {
    const W = work.width, H = work.height;
    const side = Math.min(W, H) * 0.75;
    const sx = (W - side) / 2, sy = (H - side) / 2;
    const S = FACE_SIZE;
    const out = document.createElement('canvas');
    out.width = out.height = S;
    const o = out.getContext('2d');
    o.filter = 'contrast(1.15) saturate(1.3) brightness(1.05)';
    o.drawImage(work, sx, sy, side, side, 0, 0, S, S);
    o.filter = 'none';
    const mask = document.createElement('canvas');
    mask.width = mask.height = S;
    const m = mask.getContext('2d');
    m.filter = 'blur(4px)';
    m.fillStyle = '#000';
    m.beginPath(); m.ellipse(S / 2, S / 2, S * 0.34, S * 0.45, 0, 0, Math.PI * 2); m.fill();
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(mask, 0, 0);
    o.globalCompositeOperation = 'source-over';
    out._cut = 'oval';
    return out;
  }

  // Devuelve { face, detected } o null si la fuente aún no tiene imagen.
  function fromSource(src, w, h, mirror, allowFallback = true) {
    if (!w || !h) return null;
    toWork(src, w, h, mirror);
    const lms = detect();
    if (lms) return { face: cutFromWork(lms), detected: true };
    return allowFallback ? { face: ovalFallback(), detected: false } : null;
  }

  return {
    load,
    get status() { return status; },
    fromVideo: (video, allowFallback) => fromSource(video, video.videoWidth, video.videoHeight, true, allowFallback),
    fromImage: (img, allowFallback) => fromSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height, false, allowFallback),
  };
})();
