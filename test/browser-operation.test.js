import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { browserOperation } from '../src/browser-operation.js';

// Original in-memory contract doubles only. No browser, Babylon.js, or upstream
// babalon JS code is executed by these tests.
const previousWindow = globalThis.window;
let editor, item, calls;
const operation = (tool, args = {}) => browserOperation({ tool, args });
beforeEach(() => {
  calls = [];
  const quaternion = { clone: () => ({ x: 0, y: 0, z: 0, w: 1 }) };
  item = { id: 1, name: 'Original fixture rig', kind: 'model', animationGroups: [{ name: 'Idle' }, { name: 'Wave' }],
    joints: [{ node: { name: 'Hand.R', rotationQuaternion: quaternion }, bone: 'rightHand' }] };
  editor = {
    entities: [item], selected: null,
    select(entity) { this.selected = entity; calls.push('select'); },
    pose: {
      entity: null,
      joints: entity => entity.joints ?? [],
      start(entity) { calls.push('start'); this.entity = entity; },
      selectJoint(joint) { this.joint = joint; calls.push('selectJoint'); },
      turnJoint(axis, degrees, from) { calls.push({ axis, degrees, from }); },
      end() { calls.push('end'); },
    },
    anim: {
      state(entity, withPose) { return { index: entity.clipIndex ?? 0, frame: entity.frame ?? 0, playing: !!entity.playing, ...(withPose ? { pose: 'preserved-pose' } : {}) }; },
      select(entity, clip) { entity.clipIndex = clip; },
      play(entity) { entity.playing = true; },
      pause(entity) { entity.playing = false; },
      seek(entity, frame, before) { calls.push({ frame, before }); entity.frame = frame; },
    },
  };
  globalThis.window = { editor };
});
after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });

test('contract double: pose selects entity before start and commits the rotation', async () => {
  const result = await operation('pose_joint', { id: 1, joint: 'rightHand', axis: 'z', degrees: 30 });
  assert.deepEqual(result, { id: 1, joint: 'Hand.R' });
  assert.deepEqual(calls.slice(0, 3), ['select', 'start', 'selectJoint']);
  assert.deepEqual(calls[3], { axis: 'z', degrees: 30, from: { x: 0, y: 0, z: 0, w: 1 } });
  assert.equal(calls.at(-1), 'end');
});

test('contract double: ambiguous and missing joints fail before mutation', async () => {
  item.joints.push({ node: { name: 'Hand.R' } });
  await assert.rejects(operation('pose_joint', { id: 1, joint: 'Hand.R', axis: 'x', degrees: 1 }), /ambiguous/);
  await assert.rejects(operation('pose_joint', { id: 1, joint: 'absent', axis: 'x', degrees: 1 }), /not found/);
  assert.deepEqual(calls, []);
});

test('contract double: skeleton absence is not reported as success', async () => {
  editor.pose.start = () => {};
  await assert.rejects(operation('pose_joint', { id: 1, joint: 'rightHand', axis: 'x', degrees: 1 }), /supported skeleton/);
  assert.equal(calls.includes('end'), false);
});

test('contract double: seek captures pre-change pose for upstream undo contract', async () => {
  item.frame = 7;
  const result = await operation('animation', { id: 1, action: 'seek', frame: 42 });
  assert.deepEqual(calls, [{ frame: 42, before: { index: 0, frame: 7, playing: false, pose: 'preserved-pose' } }]);
  assert.equal(result.state.frame, 42);
});

test('contract double: play, pause, missing clip, and missing frame', async () => {
  assert.equal((await operation('animation', { id: 1, action: 'play', clip: 1 })).state.index, 1);
  assert.equal((await operation('animation', { id: 1, action: 'pause' })).state.playing, false);
  await assert.rejects(operation('animation', { id: 1, action: 'play', clip: 99 }), /Clip not found/);
  await assert.rejects(operation('animation', { id: 1, action: 'seek' }), /requires frame/);
  item.animationGroups = [];
  await assert.rejects(operation('animation', { id: 1, action: 'play' }), /no animation clips/);
});

test('contract double: binary artifact encoding spans multiple base64 chunks', async () => {
  const input = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
  editor.capture = async () => new Blob([input], { type: 'image/png' });
  const result = await operation('capture_png', { scale: 1 });
  assert.equal(result.mime, 'image/png');
  assert.deepEqual(Buffer.from(result.base64, 'base64'), Buffer.from(input));
});

test('contract double: oversized artifact is rejected before arrayBuffer allocation', async () => {
  editor.exportGLB = async () => ({ size: 129 * 1024 * 1024, arrayBuffer() { throw new Error('Should not allocate'); } });
  await assert.rejects(operation('export_glb', { compact: false }), /128 MiB/);
});

test('contract double: unknown operation, entity and missing editor are explicit errors', async () => {
  await assert.rejects(operation('evaluate', { code: 'not permitted' }), /Unsupported operation/);
  await assert.rejects(operation('pose_joints', { id: 999 }), /Entity not found/);
  globalThis.window = {};
  await assert.rejects(operation('scene_list'), /window.editor missing/);
});
