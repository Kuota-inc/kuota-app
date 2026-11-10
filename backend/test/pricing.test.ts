import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFees, planOf, withIgv, PLANS } from '../src/security/pricing.js';

test('comisión: 1 % con mínimo S/ 4.50 + IGV 18 %', () => {
  // S/ 300: 1 % = S/ 3.00 < mínimo -> S/ 4.50 + IGV S/ 0.81 = S/ 5.31
  assert.deepEqual(computeFees(30000, 100), { base: 450, igv: 81, fee: 531, net: 30000 - 531 });
  // S/ 1,000: 1 % = S/ 10.00 + IGV S/ 1.80
  assert.deepEqual(computeFees(100000, 100), { base: 1000, igv: 180, fee: 1180, net: 100000 - 1180 });
  // El mínimo siempre cubre el costo fijo de 360pay (S/ 3.82)
  assert.ok(computeFees(20000, 100).base >= 382);
});

test('planes: Basic S/ 80 y Pro S/ 120 + IGV, con tope por transacción en Basic', () => {
  assert.equal(withIgv(PLANS.BASIC.price_cents), 9440);
  assert.equal(withIgv(PLANS.PRO.price_cents), 14160);
  assert.equal(planOf('PRO').max_tx_cents, null);
  assert.equal(planOf('cualquier cosa').id, 'BASIC');
  assert.equal(planOf('BASIC').max_tx_cents, 500000);
});
