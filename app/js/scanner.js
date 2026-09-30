// Barcode scanning. Uses the native BarcodeDetector where available
// (Android Chrome) and falls back to the bundled ZXing library (iOS Safari).
// Two ways in: a live camera view, or a photo taken with the phone's camera
// (sharper and better focused on iPhone, so it reads more reliably).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let zxingPromise = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing.min.js';
      s.onload = () => resolve(window.ZXing);
      s.onerror = () => { zxingPromise = null; reject(new Error('Could not load the barcode reader')); };
      document.head.appendChild(s);
    });
  }
  return zxingPromise;
}

async function hasNative() {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    return FORMATS.some((f) => supported.includes(f));
  } catch {
    return false;
  }
}

function zxingHints(ZXing) {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return hints;
}

// Sharper frames help 1-D barcodes a lot; the browser picks the nearest it can do.
const CAMERA = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

/** Ask for continuous autofocus where the camera supports it (ignored elsewhere). */
function autofocus(video) {
  const track = video.srcObject?.getVideoTracks?.()[0];
  const caps = track?.getCapabilities?.();
  if (caps?.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
}

/**
 * Start scanning into `video`. Calls onCode(code) once, then stops.
 * Returns a stop() function.
 */
export async function startScan(video, onCode) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera not available in this browser');
  let stopped = false;
  let stream = null;
  let zxControls = null;

  const stop = () => {
    stopped = true;
    zxControls?.stop?.();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const s = video.srcObject;
    if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const found = (code) => {
    if (stopped) return;
    stop();
    navigator.vibrate?.(40);
    onCode(code);
  };

  if (await hasNative()) {
    stream = await navigator.mediaDevices.getUserMedia(CAMERA);
    video.srcObject = stream;
    await video.play();
    autofocus(video);
    const det = new window.BarcodeDetector({ formats: FORMATS });
    const tick = async () => {
      if (stopped) return;
      try {
        const codes = await det.detect(video);
        if (codes.length) return found(codes[0].rawValue);
      } catch {
        /* frame not ready */
      }
      setTimeout(tick, 120);
    };
    tick();
  } else {
    const ZXing = await loadZxing();
    const reader = new ZXing.BrowserMultiFormatReader(zxingHints(ZXing), 250);
    zxControls = { stop: () => reader.reset() };
    await reader.decodeFromConstraints(CAMERA, video, (result) => {
      if (result) found(result.getText());
    });
    autofocus(video);
  }
  return stop;
}

/** Load a photo, scaled so its longest side is at most `max` px (big iPhone photos are slow to decode). */
async function photoCanvas(file, max, rotate = false) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas');
    c.width = rotate ? h : w;
    c.height = rotate ? w : h;
    const ctx = c.getContext('2d');
    if (rotate) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read a barcode from a photo. Resolves to the code, or null if none was found. */
export async function decodePhoto(file) {
  if (await hasNative()) {
    const det = new window.BarcodeDetector({ formats: FORMATS });
    for (const max of [1600, 2400]) {
      const codes = await det.detect(await photoCanvas(file, max)).catch(() => []);
      if (codes.length) return codes[0].rawValue;
    }
  }
  const ZXing = await loadZxing();
  const reader = new ZXing.BrowserMultiFormatReader(zxingHints(ZXing));
  // A few sizes, upright and turned, since phones hold barcodes every which way.
  for (const [max, rotate] of [[1600, false], [1600, true], [1000, false], [2400, false], [1000, true]]) {
    try {
      const c = await photoCanvas(file, max, rotate);
      const res = await reader.decodeFromImageUrl(c.toDataURL('image/jpeg', 0.92));
      if (res) return res.getText();
    } catch {
      /* not found at this size, try the next */
    }
  }
  return null;
}
