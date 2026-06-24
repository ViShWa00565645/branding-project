/**
 * Device Identity for BehindLens AI
 * Generates and persists a unique device ID in localStorage.
 * This enables private, per-device gallery filtering without requiring login.
 */

const STORAGE_KEY = "behindlens_vishwa_id";

/**
 * Returns a persistent unique device identifier.
 * If one doesn't exist in localStorage, generates a new UUID and stores it.
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Generates a RFC4122-compliant v4 UUID string.
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: manual v4 UUID generation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
