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

  const required = [
    '5FU',
    'Nitrógeno',
    'Kenalog',
    'Curetaje',
    'Rasurado',
    'Procedimiento Estético',
    'Toxina Botulínica',
    'Restylane',
    'Sculptra',
    'Radiesse',
    'Depilación',
  ];
  for (const name of required) {
    assert.ok((PROCEDURES as readonly string[]).includes(name), `falta ${name}`);
  }
  assert.ok(!(PROCEDURES as readonly string[]).includes('Botox y Rellenos'));
  assert.deepEqual([...PROCEDURES], [...PROCEDURES].sort((a, b) => a.localeCompare(b, 'es')));

  const botox = attendSchema.safeParse({
    appointmentId: 'a1',
    actualTime: '14:22',
    items: [{ treatment: 'Botox y Rellenos', amount: 100 }],
  });
  assert.equal(botox.success, false);

  const kenalog = attendSchema.safeParse({
    appointmentId: 'a1',
    actualTime: '14:22',
    items: [{ treatment: 'Kenalog', amount: 800 }],
  });
  assert.equal(kenalog.success, true);
});
