// Simple localStorage fallback for recordings to help the UI show saved sessions
const STORAGE_KEY = 'vora_local_recordings_v1';

export function getLocalRecordings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn('getLocalRecordings failed', e);
    return [];
  }
}

export function saveLocalRecording(rec) {
  try {
    const existing = getLocalRecordings();
    // keep newest first, ensure unique by id
    const merged = [rec, ...existing.filter(r => r?.id !== rec?.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return true;
  } catch (e) {
    console.warn('saveLocalRecording failed', e);
    return false;
  }
}

export function clearLocalRecordings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (e) {
    console.warn('clearLocalRecordings failed', e);
    return false;
  }
}

export function removeLocalRecording(id) {
  try {
    if (!id) return false;
    const existing = getLocalRecordings();
    const filtered = existing.filter(r => r?.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.warn('removeLocalRecording failed', e);
    return false;
  }
}

export default {
  getLocalRecordings,
  saveLocalRecording,
  clearLocalRecordings,
  removeLocalRecording,
};
