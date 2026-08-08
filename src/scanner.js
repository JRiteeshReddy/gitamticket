import { Html5Qrcode } from 'html5-qrcode';

let html5QrCode = null;
let isScanning = false;
let isTorchOn = false;
let currentCameraId = null;
let availableCameras = [];
let scanCooldown = false;
let onScanCallback = null;

export function isCameraScanning() {
  return isScanning;
}

export function getAvailableCameras() {
  return availableCameras;
}

export async function initScanner(containerId, onScan, onError) {
  onScanCallback = onScan;
  try {
    if (html5QrCode && isScanning) {
      await stopScanner();
    }

    html5QrCode = new Html5Qrcode(containerId);
    
    // Get list of available cameras
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        availableCameras = devices;
        // Prefer back/environment camera
        const backCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear') || d.label.toLowerCase().includes('environment'));
        currentCameraId = backCamera ? backCamera.id : devices[0].id;
      }
    } catch (e) {
      console.warn('Could not list cameras:', e);
    }

    const config = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const edge = Math.floor(minEdge * 0.72);
        return { width: edge, height: edge };
      },
      aspectRatio: 1.0,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    const cameraConfig = currentCameraId ? { deviceId: { exact: currentCameraId } } : { facingMode: 'environment' };

    await html5QrCode.start(
      cameraConfig,
      config,
      (decodedText) => {
        if (scanCooldown) return;
        scanCooldown = true;
        
        if (onScanCallback) {
          onScanCallback(decodedText);
        }

        // Auto reset cooldown after 2.5 seconds
        setTimeout(() => {
          scanCooldown = false;
        }, 2500);
      },
      (errorMessage) => {
        if (onError) onError(errorMessage);
      }
    );

    isScanning = true;
    return { success: true, cameras: availableCameras };
  } catch (err) {
    console.error('Error starting QR scanner:', err);
    isScanning = false;
    return { success: false, error: err.message || 'Failed to access camera' };
  }
}

export function resetScanCooldown() {
  scanCooldown = false;
}

export async function stopScanner() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
    } catch (e) {
      console.warn('Error stopping scanner:', e);
    } finally {
      isScanning = false;
      isTorchOn = false;
    }
  }
}

export async function toggleTorch() {
  if (!html5QrCode || !isScanning) return false;
  try {
    isTorchOn = !isTorchOn;
    await html5QrCode.applyVideoConstraints({
      advanced: [{ torch: isTorchOn }]
    });
    return isTorchOn;
  } catch (e) {
    console.warn('Torch toggle not supported on this device/browser:', e);
    isTorchOn = false;
    return false;
  }
}

export async function switchCamera(containerId, onScan, onError) {
  if (availableCameras.length <= 1) return false;

  const currentIndex = availableCameras.findIndex(c => c.id === currentCameraId);
  const nextIndex = (currentIndex + 1) % availableCameras.length;
  currentCameraId = availableCameras[nextIndex].id;

  await stopScanner();
  return await initScanner(containerId, onScan, onError);
}
