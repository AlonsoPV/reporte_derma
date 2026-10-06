import { z } from 'zod';
import { NO_SHOW_REASONS, PAYMENT_METHODS } from './constants';

export const loginSchema = z
  .object({
    email: z.string().optional(),
    doctorId: z.string().optional(),
    password: z.string().min(1, 'Contraseña requerida'),
  })
  .superRefine((data, ctx) => {
    if (!data.doctorId && !data.email) {
      ctx.addIssue({ code: 'custom', message: 'Selecciona tu cuenta' });
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      ctx.addIssue({ code: 'custom', message: 'Correo inválido' });
    }
  });

export const attendSchema = z.object({
  appointmentId: z.string().min(1),
  actualTime: z.string().min(1, 'Hora de atención requerida'),
  treatment: z.string().min(1, 'Tratamiento obligatorio'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  notes: z.string().optional(),
});

export const walkInSchema = z.object({
  patientName: z.string().min(1, 'Nombre obligatorio'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  birthDate: z.string().optional(),
  actualTime: z.string().min(1, 'Hora de atención requerida'),
  treatment: z.string().min(1, 'Tratamiento obligatorio'),
  amount: z.number().positive('El monto debe ser mayor a 0'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  notes: z.string().optional(),
  doctorId: z.string().optional(),
  attendanceDate: z.string().optional(),
});

export const classifyAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  operationalStatus: z.enum(['NO_SHOW', 'CANCELLED', 'RESCHEDULED']),
  reason: z.enum(NO_SHOW_REASONS).optional(),
  notes: z.string().optional(),
});

export const closeDaySchema = z.object({
  date: z.string().min(1),
  doctorId: z.string().optional(),
});

export const reopenDaySchema = z.object({
  closureId: z.string().min(1),
  reason: z.string().min(3, 'Motivo obligatorio'),
});

export const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'DOCTOR', 'RECEPTION', 'SUPERVISOR', 'ACCOUNTING']),
  doctorId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const doctorSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
});

export const doctorMappingSchema = z.object({
  excelName: z.string().min(1),
  doctorId: z.string().min(1),
});

export const reportFiltersSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  doctorId: z.string().optional(),
  treatment: z.string().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  origin: z.enum(['SCHEDULED', 'WALK_IN']).optional(),
  status: z.enum(['PENDING', 'ATTENDED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED']).optional(),
});
