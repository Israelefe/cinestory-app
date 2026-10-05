import assert from 'node:assert/strict';
import test from 'node:test';
import { motionPolicyViolations, verifyMotionPolicy } from './verify-motion-policy.mjs';

test('existing application follows the full-motion policy', verifyMotionPolicy);

test('build guard catches CSS, browser, Tailwind and animation-library regressions', () => {
  for (const source of [
    '@media (prefers-reduced-motion: reduce) { button { transition: none; } }',
    "window.matchMedia('(prefers-reduced-motion: reduce)').matches",
    '<div className="motion-reduce:animate-none motion-safe:animate-pulse" />',
    "import { useReducedMotion as preference } from 'framer-motion';",
    "motionLibrary.useReducedMotionConfig()",
    '<MotionConfig reducedMotion="user">',
    '<MotionConfig {...VEYLO_MOTION_CONFIG} reducedMotion="always">',
    '<MotionConfig {...localConfiguration}>',
    "import { MotionConfig as Provider } from 'framer-motion';"
  ]) {
    assert.ok(motionPolicyViolations(source).length > 0, `Guard must reject ${source}`);
  }
});

test('shared provider, photographer still settings and pause controls remain allowed', () => {
  const source = `<MotionConfig {...VEYLO_MOTION_CONFIG}>
    const still = direction.motion === 'still';
    const paused = !visible || userPaused;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const reduced = useVeyloReducedMotion();`;
  assert.deepEqual(motionPolicyViolations(source), []);
});
