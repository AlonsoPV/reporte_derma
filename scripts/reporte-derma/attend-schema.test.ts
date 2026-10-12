import assert from 'node:assert/strict';
import test from 'node:test';
import { PROCEDURES } from '../../shared/constants';
import { attendSchema } from '../../shared/schemas';

test('multiple attendances require listed procedures', () => {
  const ok = attendSchema.safeParse({
    appointmentId: 'a1',
    actualTime: '14:22',
    items: [
      { treatment: 'Consulta', amount: 1400, notes: 'primera' },
      { treatment: 'Cirugía', amount: 3500 },
    ],
  });
  assert.equal(ok.success, true);

  const empty = attendSchema.safeParse({ appointmentId: 'a1', actualTime: '14:22', items: [] });
  assert.equal(empty.success, false);

  const unknown = attendSchema.safeParse({
    appointmentId: 'a1',
    actualTime: '14:22',
    items: [{ treatment: 'Peeling', amount: 100 }],
  });
  assert.equal(unknown.success, false);

  assert.ok(PROCEDURES.includes('Aparatología Estética'));
  assert.ok(PROCEDURES.includes('Botox y Rellenos'));
});
