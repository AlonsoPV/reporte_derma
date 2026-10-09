import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTimes, toTime24h } from '../../shared/time';

test('Huli 12-hour strings become 24h', () => {
  assert.equal(toTime24h('1:00 p. m.'), '13:00');
  assert.equal(toTime24h('1:00 p.m.'), '13:00');
  assert.equal(toTime24h('01:00 PM'), '13:00');
  assert.equal(toTime24h('12:00 p. m.'), '12:00');
  assert.equal(toTime24h('12:00 a. m.'), '00:00');
  assert.equal(toTime24h('9:30 a. m.'), '09:30');
  assert.equal(toTime24h('13:00'), '13:00');
  assert.equal(toTime24h('09:00'), '09:00');
});

test('afternoon hours stored as 01:00-06:59 sort after morning', () => {
  assert.equal(toTime24h('01:00'), '13:00');
  assert.equal(toTime24h('01:30'), '13:30');
  assert.equal(toTime24h('04:00'), '16:00');
  assert.equal(toTime24h('06:30'), '18:30');
  assert.equal(toTime24h('07:00'), '07:00');
  assert.ok(compareTimes('01:00', '09:00') > 0);
  assert.ok(compareTimes('09:00', '13:00') < 0);
});

