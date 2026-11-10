import test from 'node:test';
import assert from 'node:assert/strict';
import { rucOwnership } from '../src/security/rucOwnership.js';

test('RUC 10: solo verifica si lleva el DNI del titular', () => {
  assert.equal(rucOwnership('10456789012', '45678901'), 'MATCH');
  assert.equal(rucOwnership('10456789012', '73000001'), 'MISMATCH');
  assert.equal(rucOwnership('10456789012', null), 'MISMATCH');
});

test('RUC de empresa nunca se verifica solo', () => {
  assert.equal(rucOwnership('20519482711', '45678901'), 'NEEDS_REVIEW');
  assert.equal(rucOwnership('20100047218', null), 'NEEDS_REVIEW');
});
