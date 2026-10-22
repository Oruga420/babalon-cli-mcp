import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Session } from '../src/session.js';
import { browserOperation } from '../src/browser-operation.js';

// Entirely original test double. This does NOT import, execute, or establish
// compatibility with Babylon.js or the upstream babalon JS application.
function installFixture() {
  class Vec {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    asArray() { return [this.x, this.y, this.z]; }
    clone() { return new Vec(...this.asArray()); }
    toQuaternion() { return Quat.FromEulerAngles(this.x, this.y, this.z); }
  }
  class Quat {
    constructor(x = 0, y = 0, z = 0, w = 1) { Object.assign(this, { x, y, z, w }); }
    static FromEulerAngles(x, y, z) { return new Quat(x, y, z, 1); }
    clone() { return new Quat(this.x, this.y, this.z, this.w); }
    copyFrom(other) { Object.assign(this, other); return this; }
  }
  class Observable {
    listeners = new Set();
    add(fn) { this.listeners.add(fn); return fn; }
    remove(fn) { this.listeners.delete(fn); }
    emit() { for (const fn of this.listeners) fn(); }
  }
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('2d');
  let frame = 0;
  const makeGLB = () => {
    const text = JSON.stringify({ asset: { version: '2.0', generator: 'original test fixture, not upstream' } });
    const json = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
    const bytes = new Uint8Array(20 + json.length), view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true);
    view.setUint32(8, bytes.length, true); view.setUint32(12, json.length, true);
    view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20);
    return new Blob([bytes], { type: 'model/gltf-binary' });
  };
  const e = window.editor = {
    entities: [], selected: null, recording: false, photoMode: false,
    calls: [], imports: [],
    camera: { alpha: 0.3, beta: 1, radius: 5, target: new Vec(), setTarget(v) { this.target = v; } },
    engine: { getRenderingCanvas: () => canvas },
    scene: { onBeforeRenderObservable: new Observable(), onAfterRenderObservable: new Observable() },
    addPrimitive(type) {
      const item = { id: e.entities.length + 1, name: type, kind: 'primitive', animationGroups: [],
        root: { position: new Vec(), scaling: new Vec(1, 1, 1), rotationQuaternion: new Quat() } };
      e.entities.push(item); e.selected = item; return item;
    },
    rename(item, name) { item.name = name; },
    async addFiles(files) {
      e.imports.push(...await Promise.all(files.map(async file => ({ name: file.name, type: file.type, bytes: file.size }))));
      e.addPrimitive(files[0].name).kind = 'model';
    },
    select(item) { e.selected = item; e.calls.push(['select', item.id]); },
    transformMany(items, fn) { e.calls.push(['transform', items.map(x => x.id)]); items.forEach(fn); },
    frameAll() { e.calls.push(['frameAll']); e.camera.radius = 8; },
    invalidate() { e.calls.push(['invalidate']); },
    setPhotoMode(value) { e.photoMode = value; },
    capture: async () => new Promise(resolve => canvas.toBlob(resolve, 'image/png')),
    exportGLB: async () => makeGLB(),
    pose: {
      entity: null, joint: null,
      joints: item => item.joints ?? [],
      start(item) { if (item.joints?.length) this.entity = item; },
      selectJoint(joint) { this.joint = joint; },
      turnJoint(axis, degrees, from) { e.calls.push(['turn', axis, degrees, from.w]); },
      end() { e.calls.push(['poseEnd']); },
    },
    anim: {
      select(item, clip) { item.clipIndex = clip; },
      play(item) { item.playing = true; },
      pause(item) { item.playing = false; },
      seek(item, value, before) { item.frame = value; e.calls.push(['seek', value, before ?? null]); },
      state(item) { return { index: item.clipIndex ?? 0, playing: !!item.playing, frame: item.frame ?? 0 }; },
    },
  };
  window.addRigFixture = () => {
    const item = e.addPrimitive('fake-rig');
    item.joints = [{ node: { name: 'Hand.R', rotationQuaternion: new Quat(), rotation: new Vec() }, bone: 'rightHand' }];
    item.animationGroups = [{ name: 'Idle' }, { name: 'Wave' }];
    return item.id;
  };
  function draw() {
    e.scene.onBeforeRenderObservable.emit();
    context.fillStyle = '#22143b'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#e9b83d'; context.fillRect((frame++ * 3) % 200, 20, 80, 60);
    context.fillStyle = '#ffffff'; context.font = '14px sans-serif'; context.fillText('Original test fixture', 12, 150);
    e.scene.onAfterRenderObservable.emit(); requestAnimationFrame(draw);
  }
  draw();
}

const executable = process.env.BABALON_TEST_CHROMIUM || '/usr/bin/chromium';
let available = true;
try { await access(executable); } catch { available = false; }
let server, blockedServer, session, directory, url;
let blockedRequests = 0;

before(async () => {
  if (!available) return;
  directory = await mkdtemp(path.join(tmpdir(), 'babalon-fixture-test-'));
  server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<canvas width="320" height="180"></canvas><script>(${installFixture.toString()})()</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
  blockedServer = createServer((request, response) => { blockedRequests++; response.end('not allowed'); });
  await new Promise(resolve => blockedServer.listen(0, '127.0.0.1', resolve));
  session = new Session({ url, workspace: directory, chromiumPath: executable });
  await session.start();
});
beforeEach(async () => {
  if (!available || !session?.page) return;
  await session.page.goto(url);
  await session.page.waitForFunction(() => !!window.editor);
});
after(async () => {
  await session?.close();
  await Promise.all([server, blockedServer].filter(Boolean).map(s => new Promise(resolve => s.close(resolve))));
  if (directory) await rm(directory, { recursive: true, force: true });
});
const browserTest = (name, fn) => test(name, { skip: available ? false : `Chromium unavailable at ${executable}` }, fn);

browserTest('original fixture: session, primitives, transforms, camera and strict arguments', async () => {
  assert.deepEqual((await session.run({ tool: 'scene_list' })).entities, []);
  const item = await session.run({ tool: 'add_primitive', args: { type: 'box', name: 'Fixture cube' } });
  assert.equal(item.name, 'Fixture cube');
  await session.run({ tool: 'transform', args: { id: item.id, position: [1, 2, 3], scale: [2, 3, 4], rotation: [0.1, 0.2, 0.3] } });
  assert.deepEqual(await session.page.evaluate(() => editor.entities[0].root.position.asArray()), [1, 2, 3]);
  assert.deepEqual(await session.page.evaluate(() => editor.entities[0].root.scaling.asArray()), [2, 3, 4]);
  const camera = await session.run({ tool: 'camera', args: { alpha: 1, beta: 0.5, radius: 4, target: [3, 2, 1] } });
  assert.deepEqual(camera, { alpha: 1, beta: 0.5, radius: 4, target: [3, 2, 1] });
  await assert.rejects(session.run({ tool: 'transform', args: { id: item.id, scale: [-1, 1, 1] } }));
  await assert.rejects(session.run({ tool: 'scene_list', args: { unexpected: true } }));
  await assert.rejects(session.run({ tool: 'arbitrary_eval', args: {} }), /Unknown tool/);
  await assert.rejects(session.run({ tool: 'transform', args: { id: 999, position: [1, 2, 3] } }), /Entity not found/);
});

browserTest('original fixture: ordered queue survives a failed operation', async () => {
  const first = session.run({ tool: 'add_primitive', args: { type: 'box' } });
  const failed = session.run({ tool: 'transform', args: { id: 999, position: [1, 1, 1] } });
  const third = session.run({ tool: 'add_primitive', args: { type: 'sphere' } });
  const results = await Promise.allSettled([first, failed, third]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.deepEqual((await session.run({ tool: 'scene_list' })).entities.map(x => x.name), ['box', 'sphere']);
});

browserTest('original fixture: pose dispatch and animation controls', async () => {
  const id = await session.page.evaluate(() => addRigFixture());
  assert.deepEqual(await session.run({ tool: 'pose_joints', args: { id } }), [{ name: 'Hand.R', bone: 'rightHand' }]);
  await session.run({ tool: 'pose_joint', args: { id, joint: 'rightHand', axis: 'x', degrees: 45 } });
  const calls = await session.page.evaluate(() => editor.calls);
  assert.ok(calls.some(call => call[0] === 'turn' && call[2] === 45));
  assert.ok(calls.some(call => call[0] === 'poseEnd'));
  await assert.rejects(session.run({ tool: 'pose_joint', args: { id, joint: 'missing', axis: 'x', degrees: 10 } }), /Joint not found/);
  assert.equal((await session.run({ tool: 'animation', args: { id, action: 'play', clip: 1 } })).state.playing, true);
  assert.equal((await session.run({ tool: 'animation', args: { id, action: 'pause' } })).state.playing, false);
  assert.equal((await session.run({ tool: 'animation', args: { id, action: 'seek', frame: 12 } })).state.frame, 12);
  await assert.rejects(session.run({ tool: 'animation', args: { id, action: 'play', clip: 99 } }), /Clip not found/);
});

browserTest('original fixture: GLB export/import bytes and invalid input rejection', async () => {
  const result = await session.run({ tool: 'export_glb', args: { path: 'fixture.glb' } });
  assert.equal(result.mime, 'model/gltf-binary');
  const bytes = await readFile(path.join(directory, 'fixture.glb'));
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
  await session.run({ tool: 'import_glb', args: { path: 'fixture.glb' } });
  assert.equal((await session.page.evaluate(() => editor.imports))[0].bytes, bytes.length);
  await writeFile(path.join(directory, 'invalid.glb'), 'not a GLB');
  await assert.rejects(session.run({ tool: 'import_glb', args: { path: 'invalid.glb' } }), /Expected GLB/);
  await assert.rejects(session.run({ tool: 'export_glb', args: { path: 'fixture.glb' } }), /already exists/);
});

browserTest('original fixture: PNG artifact has real PNG signature and decodes', async () => {
  const result = await session.run({ tool: 'capture_png', args: { path: 'fixture.png' } });
  assert.equal(result.mime, 'image/png');
  const bytes = await readFile(path.join(directory, 'fixture.png'));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const size = await session.page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`;
    await image.decode(); return [image.naturalWidth, image.naturalHeight];
  }, bytes.toString('base64'));
  assert.deepEqual(size, [320, 180]);
});

browserTest('original fixture: actual Chromium WebM recording decodes and restores state', async () => {
  const result = await session.run({ tool: 'record_video', args: { path: 'fixture.webm', duration: 1, height: 720, motion: 'orbit' } });
  assert.equal(result.mime, 'video/webm');
  const bytes = await readFile(path.join(directory, 'fixture.webm'));
  assert.equal(bytes.subarray(0, 4).toString('hex'), '1a45dfa3');
  assert.ok(bytes.length > 1000);
  const details = await session.page.evaluate(async base64 => {
    const video = document.createElement('video'); video.muted = true;
    video.src = `data:video/webm;base64,${base64}`;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('Cannot decode fixture recording')); });
    await video.play(); await new Promise(resolve => setTimeout(resolve, 50)); video.pause();
    return { width: video.videoWidth, height: video.videoHeight, alpha: editor.camera.alpha, photo: editor.photoMode,
      recording: editor.recording, beforeObservers: editor.scene.onBeforeRenderObservable.listeners.size,
      afterObservers: editor.scene.onAfterRenderObservable.listeners.size };
  }, bytes.toString('base64'));
  assert.deepEqual(details, { width: 1280, height: 720, alpha: 0.3, photo: false, recording: false, beforeObservers: 0, afterObservers: 0 });
});

browserTest('original fixture: cross-origin HTTP is blocked and arbitrary browser operations fail', async () => {
  const target = `http://127.0.0.1:${blockedServer.address().port}/private`;
  const outcome = await session.page.evaluate(async target => { try { await fetch(target); return 'allowed'; } catch { return 'blocked'; } }, target);
  assert.equal(outcome, 'blocked'); assert.equal(blockedRequests, 0);
  await assert.rejects(session.page.evaluate(browserOperation, { tool: 'evaluate', args: { code: 'alert(1)' } }), /Unsupported operation/);
});
