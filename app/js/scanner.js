// Camera barcode scanning. Uses the native BarcodeDetector where available
// (Android Chrome) and falls back to the bundled ZXing library (iOS Safari).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let zxingPromise = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing.min.js';
      s.onload = () => resolve(window.ZXing);
      s.onerror = () => reject(new Error('Could not load the barcode scanner'));
      document.head.appendChild(s);
    });
  }
  return zxingPromise;
}

/**
 * Start scanning into `video`. Calls onCode(code) once, then stops.
 * Returns a stop() function.
 */
export async function startScan(video, onCode) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not available in this browser');
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

  let native = false;
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      native = FORMATS.some((f) => supported.includes(f));
    } catch {
      native = false;
    }
  }

  if (native) {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const det = new window.BarcodeDetector({ formats: FORMATS });
    const tick = async () => {
      if (stopped) return;
      try {
        const codes = await det.detect(video);
        if (codes.length) return found(codes[0].rawValue);
      } catch {
        /* frame not ready */
      }
      requestAnimationFrame(tick);
    };
    tick();
  } else {
    const ZXing = await loadZxing();
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ]);
    const reader = new ZXing.BrowserMultiFormatReader(hints, 300);
    zxControls = { stop: () => reader.reset() };
    await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (result) => {
      if (result) found(result.getText());
    });
  }
  return stop;
}
