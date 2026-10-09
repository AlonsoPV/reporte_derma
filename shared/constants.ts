export const ROLES = ['ADMIN', 'DOCTOR', 'RECEPTION', 'SUPERVISOR', 'ACCOUNTING'] as const;
export type Role = (typeof ROLES)[number];

// Staff explicitly retained by the clinic, including legacy accounts with demo-domain identifiers.
export const RETAINED_CLINIC_DOCTORS = [
  'Berenice Gomez Tagle Boix',
  'Luisa Fernanda Martínez Rosas Hijar',
  'María Alejandra Chacón Ruiz',
  'Myrna Mariela Elizondo Elizondo',
] as const;

export function canSeeAll(role?: string | null) {
  return role === 'ADMIN' || role === 'RECEPTION';
}

export function isReadOnlyRole(role?: string | null) {
  return role === 'RECEPTION';
}

export function homePathForRole(role?: string | null) {
  return canSeeAll(role) ? '/admin' : '/hoy';
}

export const OPERATIONAL_STATUSES = [
  'PENDING',
  'ATTENDED',
  'NO_SHOW',
  'CANCELLED',
  'RESCHEDULED',
] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ATTENDANCE_ORIGINS = ['SCHEDULED', 'WALK_IN'] as const;
export type AttendanceOrigin = (typeof ATTENDANCE_ORIGINS)[number];

export const NO_SHOW_REASONS = [
  'NO_SE_PRESENTO',
  'CANCELO',
  'REAGENDO',
  'OTRO',
] as const;
export type NoShowReason = (typeof NO_SHOW_REASONS)[number];

export const EXPECTED_EXCEL_COLUMNS = [
  'Fecha',
  'Inicio',
  'Fin',
  'Duración',
  'Nombre',
  'Teléfono',
  'Seguro',
  'Fecha de Nacimiento',
  'Correo',
  'Estado',
  'Asistencia',
  'Etiquetas',
  'Notas',
  'Calendario',
  'Doctor',
  'ID cita',
] as const;

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

export const STATUS_LABELS: Record<OperationalStatus, string> = {
  PENDING: 'Pendiente',
  ATTENDED: 'Atendido',
  NO_SHOW: 'No atendido',
  CANCELLED: 'Cancelado',
  RESCHEDULED: 'Reagendado',
};

export const ORIGIN_LABELS: Record<AttendanceOrigin, string> = {
  SCHEDULED: 'Agendado',
  WALK_IN: 'Sin cita',
};

export const NO_SHOW_REASON_LABELS: Record<NoShowReason, string> = {
  NO_SE_PRESENTO: 'No se presentó',
  CANCELO: 'Canceló',
  REAGENDO: 'Reagendó',
  OTRO: 'Otro',
};
