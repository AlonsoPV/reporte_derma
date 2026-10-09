import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDayKpis,
  isOnAgenda,
  namesMatch,
  normalizeMatchKey,
} from '../../shared/match';

test('doctor names match ignoring title, accents and extra spaces', () => {
  assert.equal(normalizeMatchKey('Dra. Ana Patricia Solís'), 'ana patricia solis');
  assert.ok(namesMatch('Dra. Ana Patricia Solís', 'Ana Patricia Solis'));
  assert.ok(namesMatch('Berenice Gomez Tagle Boix', 'BERENICE  GOMEZ TAGLE BOIX'));
});

test('attended appointment leaves the agenda even if status lagged', () => {
  const pending = { operationalStatus: 'PENDING' };
  const cancelled = { operationalStatus: 'CANCELLED' };
  const attendedByStatus = { operationalStatus: 'ATTENDED' };
  const attendedByRecord = { operationalStatus: 'CANCELLED', attendance: { id: 'a1' } };

  assert.equal(isOnAgenda(pending), true);
  assert.equal(isOnAgenda(cancelled), true);
  assert.equal(isOnAgenda(attendedByStatus), false);
  assert.equal(isOnAgenda(attendedByRecord), false);
});

test('day KPIs count attendances for attended and keep cancelled off pending', () => {
  const kpis = buildDayKpis(
    [
      { operationalStatus: 'PENDING' },
      { operationalStatus: 'CANCELLED' },
      { operationalStatus: 'PENDING', attendance: { id: '1' } },
    ],
    [
      { origin: 'SCHEDULED', amount: 1200 },
      { origin: 'WALK_IN', amount: 650 },
    ],
    Number,
  );
  assert.equal(kpis.scheduled, 3);
  assert.equal(kpis.attended, 2);
  assert.equal(kpis.pending, 1);
  assert.equal(kpis.cancelledOrNoShow, 1);
  assert.equal(kpis.walkIns, 1);
  assert.equal(kpis.amount, 1850);
});
