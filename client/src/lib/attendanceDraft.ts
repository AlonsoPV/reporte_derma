import type { ProcedureLine, RecipeLine } from '../components/ProcedureLines';

const KEY = 'dermaops-attendance-draft';
const MAX_AGE_MS = 18 * 60 * 60 * 1000;

export type AttendanceDraft = {
  kind: 'attend' | 'walk-in';
  date: string;
  appointmentId?: string;
  actualTime?: string;
  patientName?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  doctorId?: string;
  lines: ProcedureLine[];
  recipe: RecipeLine[];
  savedAt?: number;
};

function readRaw() {
  const stored = localStorage.getItem(KEY);
  if (stored) return stored;
  const previous = sessionStorage.getItem(KEY);
  if (!previous) return null;
  localStorage.setItem(KEY, previous);
  sessionStorage.removeItem(KEY);
  return previous;
}

export function readDraft(): AttendanceDraft | null {
  try {
    const raw = readRaw();
    if (!raw) return null;
    const draft = JSON.parse(raw) as AttendanceDraft;
    if (!draft || (draft.kind !== 'attend' && draft.kind !== 'walk-in')) return null;
    if (!Array.isArray(draft.lines) || !Array.isArray(draft.recipe)) return null;
    if (draft.savedAt && Date.now() - draft.savedAt > MAX_AGE_MS) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: AttendanceDraft) {
  localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
}

export function clearDraft() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}

export function draftForAppointment(appointmentId: string) {
  const draft = readDraft();
  if (draft?.kind === 'attend' && draft.appointmentId === appointmentId) return draft;
  return null;
}

export function draftForWalkIn(date: string) {
  const draft = readDraft();
  if (draft?.kind === 'walk-in' && draft.date === date) return draft;
  return null;
}
