# babalon CLI + MCP

An independent local automation wrapper for [babalon JS](https://github.com/holondo/babalonJS), Guilherme Holanda Sanches's touch-first 3D scene composer built with Babylon.js. This is **not Blender**, bpy, a `.blend` reader, or a fork of the editor.

Create a scene from a JSON recipe or give an MCP client explicit scene tools. Import self-contained GLB models, pose supported skeletons, control clips/camera, export GLB, capture PNG, and record silent WebM camera shots. No paid service, API key, account, persistent daemon, or public HTTP bridge.

## Status: experimental adapter

Source contract targeted at upstream commit [`e3e2757c70689f1116072b9d8c1136ae4b7556d5`](https://github.com/holondo/babalonJS/tree/e3e2757c70689f1116072b9d8c1136ae4b7556d5). `window.editor` is exposed by upstream for automation, but is not a stable public API. Startup checks required methods, **not the deployed commit**. Pin your editor checkout yourself. Other versions may break.

Verification: [20 tests pass in GitHub Actions](https://github.com/Oruga420/babalon-cli-mcp/actions/runs/39725155057), with zero skips, including security/schema tests, real MCP SDK stdio handshake, and Chrome browser tests with an independently written editor fixture. PNG and WebM outputs were decoded in that fixture. This proves the wrapper pipeline, not upstream integration. **End-to-end execution of upstream is not yet verified.** No claim of GLB animation round-trip or production editor compatibility is made. See `NOTICE.md` for provenance.

## Setup

Node.js 22+ and a Chromium executable are required. Install this wrapper's locked packages:

```sh
npm ci --ignore-scripts
npm test
node src/cli.js --help
```

Separately obtain and review the pinned babalon JS source. Follow its README to install/build/serve it locally. This wrapper never downloads, installs, launches a server for, or updates upstream. Running its CLI or `open_editor` executes the local web app you choose. Only run a trusted checkout. The default Vite development port is 5173; bind it to loopback.

Use a dedicated workspace containing **only assets you want the editor to read**. Paths are relative to that folder. Create output subfolders beforehand. Existing files are never overwritten.

## CLI

```sh
node src/cli.js validate examples/scene.json --workspace .
node src/cli.js run examples/scene.json \
  --workspace . --url http://127.0.0.1:5173/ \
  --chromium /usr/bin/chromium
```

`--headed` shows the isolated browser. On Windows/macOS pass your installed Chrome/Chromium executable path. The example produces `scene.png`, `scene.glb`, and `orbit.webm`. Choose new filenames for another run. Each run is a fresh scene session; output is newline-delimited JSON. Entity IDs are session-scoped: use `scene_list` to discover them in MCP. Recipes cannot reference results dynamically in v0.1.

A recipe is an array, maximum 100 operations:

```json
[
  {"tool":"import_glb","args":{"path":"robot.glb"}},
  {"tool":"camera","args":{"frameAll":true}},
  {"tool":"capture_png","args":{"path":"robot.png","scale":1}}
]
```

GLB files must embed resources. External glTF buffers/textures and remote model URLs are intentionally rejected. Importing arbitrary `.gltf`, project ZIPs, and `.babalon` archives is not supported in this first version.

## MCP (stdio)

Configure your MCP client manually; this repository does not install itself into any account:

```json
{
  "mcpServers": {
    "babalon": {
      "command": "node",
      "args": [
        "/absolute/path/babalon-cli-mcp/src/mcp.js",
        "--url", "http://127.0.0.1:5173/",
        "--workspace", "/absolute/path/video-assets",
        "--chromium", "/usr/bin/chromium"
      ]
    }
  }
}
```

First call `open_editor`. This creates a fresh browser context with no existing cookies, login, or saved project. Use scene tools, export anything you want to keep, then `close_editor`. Closing discards unsaved changes. stdout carries only MCP protocol; diagnostics use stderr.

| Tool | Arguments / effect |
|---|---|
| `open_editor` / `close_editor` | Start/close dedicated session |
| `scene_list` | Entity IDs, names, clip names and camera state |
| `add_primitive` | `type`: box/sphere/cylinder/cone/torus/plane; optional `name` |
| `import_glb` | Relative `path`, self-contained GLB v2, max 64 MiB |
| `transform` | `id`, optional `position`, positive `scale`, Euler `rotation` (radians), each `[x,y,z]`; undo-aware |
| `camera` | Optional `frameAll`, `alpha`, `beta` (radians), `radius`, `target` |
| `pose_joints` | `id`; list node names and recognized humanoid bones |
| `pose_joint` | `id`, unique `joint` name/bone, `axis` x/y/z, `degrees`; pauses animation, records undo |
| `animation` | `id`, `action` play/pause/seek, optional `clip` index; seek requires `frame` |
| `export_glb` | New `.glb` `path`, optional `compact` false |
| `capture_png` | New `.png` `path`, optional `scale` 1–4 |
| `record_video` | New `.webm` `path`, `duration` 1–30 sec, `height` 720/1080, `motion` still/orbit/sway |

## Video behavior and limits

The wrapper has a small original MediaRecorder implementation operating on the editor canvas. It does not import a Vite-only `/src/*.ts` module or call private UI methods. Video records the **full canvas aspect**, unlike upstream's photo-aspect crop. It restores camera alpha and photo mode after recording or error. It supports WebM only, prioritizing VP9 then VP8, with no audio. Add narration/music in your video editor.

Recording requests 30 FPS in realtime. Frame drops depend on GPU/browser/load: this is **not deterministic offline rendering**. Duration includes realtime capture, not movie encoding speed. Each operation has a 60-second deadline; timeout closes the session. Output blobs are capped at 128 MiB. Cancel by terminating the CLI/MCP process (closes the browser); in-process cancellation is not exposed yet. Rendering and scene mutations are serialized.

Built-in editor animation-library downloads and remote environment maps may fail because this wrapper blocks all browser requests outside the exact configured loopback origin. Supply all required resources locally. It does not bypass this network policy for convenience.

## Safety boundaries

- Only explicit loopback HTTP editor URLs (`127.0.0.1` or `[::1]`); no remote URLs, user info, queries, or fragments.
- Dedicated nonpersistent browser context; service workers blocked; HTTP/WebSocket traffic restricted to configured origin/host. No existing browser profile/CDP connection.
- No general `eval`, shell, arbitrary method invocation, remote asset fetch, or credential tools.
- Workspace confinement, symlink-escape checks, input size bounds, new-files-only outputs.
- Designed for a trusted local user and trusted local editor. Not a sandbox for malicious editor code, assets, or hostile local processes. Do not point it at a folder containing secrets. Same-origin app code is trusted, and concurrent filesystem tampering is outside its threat model.
- MCP requests mutate only this isolated scene and write requested artifacts. Review client approval settings. Never expose stdio through an unauthenticated network bridge.

## Development

`npm run check` runs syntax checks and Node tests. Browser fixture tests use `BABALON_TEST_CHROMIUM` or `/usr/bin/chromium`, and explicitly skip if unavailable. The fixture proves transport/adapter behavior, not compatibility with the upstream application. No upstream code or private assets are bundled.

GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
