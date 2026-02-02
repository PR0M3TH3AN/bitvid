import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_ACCENT_OVERRIDES } from '../../config/instance-config.js';

test('embed accent color configuration', () => {
  // Verify the config is readable and has the expected structure
  assert.ok(THEME_ACCENT_OVERRIDES, 'THEME_ACCENT_OVERRIDES should be defined');
  assert.ok(THEME_ACCENT_OVERRIDES.light, 'light theme overrides should be defined');
  assert.equal(THEME_ACCENT_OVERRIDES.light.accent, '#540011', 'accent color should match requirement');
});
