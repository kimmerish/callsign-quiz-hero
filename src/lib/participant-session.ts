const TOKEN_KEY = "quiz_device_token";
const SESSION_KEY = "quiz_participant";

export type StoredParticipant = {
  id: string;
  callsign: string;
  unit_id: string;
  unit_name: string;
};

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

export function getDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY) ?? readCookie(TOKEN_KEY);
}

export function getStoredParticipant(): StoredParticipant | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredParticipant;
  } catch {
    return null;
  }
}

export function saveParticipantSession(token: string, participant: StoredParticipant) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(participant));
  setCookie(TOKEN_KEY, token);
}

export function clearParticipantSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
