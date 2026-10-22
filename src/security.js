import { realpath, lstat, readFile, open } from 'node:fs/promises';
import path from 'node:path';
export function editorURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash)
    throw new Error('Editor must be an explicit loopback http://127.0.0.1:PORT/ or http://[::1]:PORT/ URL without credentials/query/hash');
  return u.href;
}
export class Workspace {
  constructor(root) { this.root = root; }
  async init() { this.root = await realpath(this.root); return this; }
  async resolve(name, output = false) {
    if (typeof name !== 'string' || !name || path.isAbsolute(name) || name.includes('\0')) throw new Error('Use a relative workspace path');
    const p = path.resolve(this.root, name);
    const inside = q => q.startsWith(this.root + path.sep);
    if (!inside(p)) throw new Error('Path escapes workspace');
    if (output) {
      if (!inside(await realpath(path.dirname(p))) && await realpath(path.dirname(p)) !== this.root) throw new Error('Symlink escapes workspace');
      try { await lstat(p); throw new Error('Output already exists; choose a new filename'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
    } else if (!inside(await realpath(p))) throw new Error('Symlink escapes workspace');
    return p;
  }
  async read(name, max = 64 * 1024 * 1024) { const p = await this.resolve(name); const st = await lstat(p); if(!st.isFile() || st.size > max) throw new Error('Input is not a regular file or exceeds size limit'); return readFile(p); }
  async write(name, bytes) { const p = await this.resolve(name, true); const f = await open(p, 'wx', 0o600); try { await f.writeFile(bytes); } finally { await f.close(); } return { path: name, bytes: bytes.length }; }
}
export function assertGLB(bytes) {
  if(bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Expected GLB v2');
  const end = 20 + bytes.readUInt32LE(12); if(end > bytes.length) throw new Error('Invalid GLB JSON length');
  const doc = JSON.parse(bytes.subarray(20,end).toString('utf8'));
  for(const item of [...(doc.buffers ?? []), ...(doc.images ?? [])]) if(item.uri && !item.uri.startsWith('data:')) throw new Error('External GLB resource URIs are not allowed');
}
