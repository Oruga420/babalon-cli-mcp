# Attribution and compatibility

babalon JS: https://github.com/holondo/babalonJS
Author: Guilherme Holanda Sanches.
Upstream license: GPL-3.0-or-later.
Reviewed commit: e3e2757c70689f1116072b9d8c1136ae4b7556d5.

This independently authored CLI/MCP adapter uses upstream's exposed editor interface. It does not bundle upstream application source, models, icons, or textures and is not endorsed by its author. The adapter is distributed under GPL-3.0-or-later; dependency licenses remain their own.

Contract source references at that commit:
- src/main.ts: window.editor exposure.
- src/core/editor.ts: entities, primitives, transforms, camera, addFiles, capture, exportGLB.
- src/animation/animation.ts: play, pause, seek, state.
- src/animation/pose.ts: joints, start, selectJoint, turnJoint, end.
- src/capture/video.ts and src/ui/photo.ts: upstream realtime recording behavior, reviewed for compatibility. Our recorder is an independent full-canvas WebM implementation, not the upstream photo-cropped recorder.

Babylon.js (https://www.babylonjs.com/) is the underlying 3D engine, not the same project as babalon JS. This repository provides no Blender or bpy compatibility.
