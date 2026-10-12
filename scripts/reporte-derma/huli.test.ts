import assert from 'node:assert/strict';
import test from 'node:test';
import { huliAgendaStatus, huliText, mapHuliEstado, parseHuliDate } from '../../shared/huli';
import { compareTimes, toTime24h } from '../../shared/time';

test('Huli export times from 8-10 oct file convert to 24h and sort', () => {
  assert.equal(toTime24h('8:00 AM'), '08:00');
  assert.equal(toTime24h('9:30 AM'), '09:30');
  assert.equal(toTime24h('12:00 PM'), '12:00');
  assert.equal(toTime24h('1:00 PM'), '13:00');
  assert.equal(toTime24h('1:30 PM'), '13:30');
  assert.equal(toTime24h('4:00 PM'), '16:00');
  assert.equal(toTime24h('6:30 PM'), '18:30');
  assert.equal(toTime24h('7:00 PM'), '19:00');
  assert.ok(compareTimes('1:00 PM', '9:00 AM') > 0);
  assert.ok(compareTimes('8:00 AM', '1:00 PM') < 0);
});

function utcDay(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

test('Huli Fecha stays on the Excel calendar day', () => {
  assert.equal(utcDay(parseHuliDate('11/10/2026')), '2026-10-11');
  assert.equal(utcDay(parseHuliDate('11/10/26')), '2026-10-11');
  assert.equal(utcDay(parseHuliDate('2026-10-11')), '2026-10-11');
  assert.equal(utcDay(parseHuliDate('11 de octubre de 2026')), '2026-10-11');
  assert.equal(utcDay(parseHuliDate(new Date(Date.UTC(2026, 9, 11)))), '2026-10-11');
  assert.equal(utcDay(parseHuliDate('2026-10-12T01:00:00.000Z')), '2026-10-11');
  assert.equal(utcDay(parseHuliDate(new Date('2026-10-12T01:00:00.000Z'))), '2026-10-11');
  const serial = (Date.UTC(2026, 9, 11) - Date.UTC(1899, 11, 30)) / 86400000;
  assert.equal(utcDay(parseHuliDate(serial)), '2026-10-11');
  assert.equal(utcDay(parseHuliDate('11/10/2026 7:00 PM')), '2026-10-11');
});

test('Huli dash placeholders are blank', () => {
  assert.equal(huliText('-'), '');
  assert.equal(huliText('—'), '');
  assert.equal(huliText('Ana Karen'), 'Ana Karen');
});

test('Huli Estado values map to operational status and agenda badge', () => {
  assert.equal(mapHuliEstado('Agendada'), 'PENDING');
  assert.equal(mapHuliEstado('Completada'), 'PENDING');
  assert.equal(mapHuliEstado('Cancelada'), 'CANCELLED');
  assert.equal(mapHuliEstado('Reagendada'), 'RESCHEDULED');
  assert.equal(mapHuliEstado('Paciente no se presentó'), 'NO_SHOW');

  assert.deepEqual(huliAgendaStatus('Cancelada', 'Confirmada'), { status: 'CANCELLED', label: 'Cancelada' });
  assert.deepEqual(huliAgendaStatus('Paciente no se presentó', 'Sin confirmar'), { status: 'NO_SHOW', label: 'No se presentó' });
  assert.deepEqual(huliAgendaStatus('Completada', 'Confirmada'), { status: 'COMPLETADA', label: 'Completada' });
  assert.deepEqual(huliAgendaStatus('Agendada', 'Confirmada'), { status: 'CONFIRMADA', label: 'Confirmada' });
  assert.deepEqual(huliAgendaStatus('Agendada', 'Sin confirmar'), { status: 'PENDING', label: 'Sin confirmar' });
  assert.deepEqual(huliAgendaStatus('Reagendada', 'Sin confirmar'), { status: 'RESCHEDULED', label: 'Reagendada' });
  assert.deepEqual(huliAgendaStatus('Reagendada', 'Confirmada'), { status: 'RESCHEDULED', label: 'Reagendada' });
  assert.deepEqual(
    huliAgendaStatus('Agendada', 'Confirmada', 'CANCELLED'),
    { status: 'CANCELLED', label: 'Cancelada' },
  );
  assert.deepEqual(
    huliAgendaStatus('Agendada', 'Confirmada', 'NO_SHOW'),
    { status: 'NO_SHOW', label: 'No se presentó' },
  );
});
