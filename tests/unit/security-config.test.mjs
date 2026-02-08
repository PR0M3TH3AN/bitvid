import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IS_DEV_MODE, IS_VERBOSE_DEV_MODE } from '../../config/instance-config.js';

test('Security configuration: IS_VERBOSE_DEV_MODE must be false', () => {
  assert.strictEqual(IS_VERBOSE_DEV_MODE, false, 'IS_VERBOSE_DEV_MODE should be false in production');
});

test('Security configuration: IS_DEV_MODE must be false', () => {
  assert.strictEqual(IS_DEV_MODE, false, 'IS_DEV_MODE should be false in production');
});
