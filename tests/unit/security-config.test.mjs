import { test } from 'node:test';
import assert from 'node:assert';
import { IS_DEV_MODE, IS_VERBOSE_DEV_MODE } from '../../config/instance-config.js';

test('Security configuration: Development mode should be disabled in production', () => {
  assert.strictEqual(IS_DEV_MODE, false, 'IS_DEV_MODE must be false for production builds');
});

test('Security configuration: Verbose diagnostics should be disabled in production', () => {
  assert.strictEqual(IS_VERBOSE_DEV_MODE, false, 'IS_VERBOSE_DEV_MODE must be false for production builds');
});
