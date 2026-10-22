# Next tasks: babalon CLI + MCP

Development handoff, reviewed 2026-10-22. Start with P0, then P1. Check an item only after its acceptance criteria are verified; attach a commit, test run or reproducible report. This is a backlog, not a claim that these capabilities already work with the real editor.

## Baseline and scope

- Wrapper baseline: `7c6791c5a95f50c8980373b36098f77de2a9afd1`.
- Upstream: [holondo/babalonJS](https://github.com/holondo/babalonJS), pinned to `e3e2757c70689f1116072b9d8c1136ae4b7556d5`.
- [Baseline CI](https://github.com/Oruga420/babalon-cli-mcp/actions/runs/39725248885) is green. The suite has **20 tests**, including real Chrome with an independently authored editor fixture, PNG/WebM decoding, security checks and the real MCP SDK stdio handshake.
- **The real upstream editor has not been executed or integration-tested.** Fixture success is not proof of upstream compatibility, GLB animation round-trip, or production-build compatibility.
- Existing interfaces: CLI recipes and 13 stdio MCP tools. Source: `src/session.js`, `src/browser-operation.js`, `src/schema.js`, `src/security.js`, `src/cli.js`, `src/mcp.js`.
- MVP boundaries: local loopback editor, isolated nonpersistent browser, self-contained GLB input, PNG capture, silent realtime WebM, primitives, transforms, camera, skeleton posing and clip controls. No Blender/.blend/bpy, arbitrary JavaScript/shell tool, remote editor, audio mixing, deterministic renderer, project archive import or automatic MCP installation.
- Preserve GPL-3.0-or-later attribution. Never commit credentials, browser profiles, personal assets or unlicensed sample models. Do not weaken workspace or network restrictions to make a test pass.
- Review third-party source and obtain any required execution approval before installing/running it. This document does not grant machine access, installation permission or permission to execute third-party code.

## P0: prove the actual integration

- [ ] **Reproduce the wrapper baseline on the target computer.**
  - Use Node 22+ and an installed Chrome/Chromium. Set `BABALON_TEST_CHROMIUM` to the actual executable, including on Windows/macOS.
  - Run from the wrapper checkout:
    ```sh
    npm ci --ignore-scripts
    npm run check
    node src/cli.js validate examples/scene.json --workspace .
    ```
  - Acceptance: record OS, Node and browser versions; all 20 baseline tests pass with **zero browser skips**. A missing browser is not a passing browser validation. Preserve all existing tests while adding regressions.

- [ ] **Prepare a reviewed, pinned local upstream checkout and establish startup compatibility.**
  - Check out the upstream SHA above and verify `git rev-parse HEAD`. Read its `README.md`, `AGENTS.md`, package scripts and lockfile before installation/execution. Use its documented build and serving workflow, only after the operator authorizes that execution.
  - Serve on `127.0.0.1` or `[::1]`; do not expose a public server. Use an empty dedicated browser context and assets workspace, not an existing working project or login profile.
  - Test both Vite development and the built production app. Current adapter does not dynamically import Vite-only `/src/*.ts`.
  - Acceptance: `Session.start()` succeeds in both modes; inspect console/network failures. Identify any blocked remote resources and provide licensed local equivalents instead of opening the network allowlist. Record actual upstream SHA and build mode in an integration report.

- [ ] **Run a real CLI smoke scene and inspect the artifacts.**
  - Copy `examples/scene.json` into a clean assets workspace. Output filenames must not exist; the wrapper deliberately refuses overwrite.
  - After the local editor is running, use:
    ```sh
    node src/cli.js run scene.json --workspace /absolute/path/to/clean-assets --url http://127.0.0.1:5173/ --chromium /absolute/path/to/chromium
    ```
    Adapt executable paths and port to the target machine; `--headed` is available.
  - Acceptance: actual editor creates the named primitive; PNG opens and shows the intended scene; GLB opens in a fresh editor; WebM decodes, has nonzero duration and expected dimensions, and visibly moves the camera. Inspect several frames, not just file existence. Document dropped-frame/realtime limitations. No audio is expected.

- [ ] **Exercise all MCP tools against upstream, not only fixture calls.**
  - Use the README configuration through a temporary test client first. Do not modify persistent client settings without the operator's approval.
  - Verify initialize/list, `open_editor`, scene discovery, primitives, transforms, camera, GLB import/export, PNG/WebM, rig joints, posing, clip play/pause/seek, and `close_editor`.
  - Use a small redistributable self-contained rigged GLB with known joints and two clips; record its provenance/license. Entity IDs are session-scoped: discover them, never assume a fixed number.
  - Acceptance: pose changes the chosen joint, pauses playback and creates an undo step; seek preserves undo behavior; unsupported skeletons, missing/ambiguous joints and missing clips fail clearly. Test close/reopen and repeated open. Save an explicit capabilities matrix of passed/failed/not tested.

- [ ] **Add a repeatable opt-in upstream integration suite.**
  - Keep fixture tests separate and fast. The real suite should require an explicit local editor URL, executable and known test assets; do not silently download/run upstream during ordinary unit tests.
  - Compare primitive/model transforms, camera, materials and visible geometry after GLB round-trip. Test clips/poses separately: GLB is not a full editable-project save format.
  - Acceptance: reproducible commands, pinned versions, failure diagnostics and safe synthetic/redistributable artifacts. Update README claims only to match observed results.

## P1: harden failure paths before calling the adapter reliable

- [ ] **Strengthen the startup capability contract.**
  - Current startup checks only six editor methods and does not verify the running commit. Later tools also rely on camera, animation, posing, scene observables and engine methods.
  - Acceptance: detect missing capabilities before mutation, provide actionable compatibility errors, and distinguish declared target SHA from verified runtime identity. Add incompatible-editor fixtures; do not pretend method presence proves version identity.

- [ ] **Validate all artifact envelopes before writing.**
  - `Session.execute()` validates GLB output but currently trusts PNG/WebM MIME/base64. Browser-side blobs have a 128 MiB cap; mirror bounded validation at the Node boundary.
  - Acceptance: reject malformed base64, mismatched MIME/extensions, invalid PNG/WebM signatures and oversized responses before creating a file. Include positive decoding tests, negative cases and no-partial-output assertions.

- [ ] **Make recording cleanup robust at every failure point.**
  - In `record_video`, stream/recorder setup and photo-mode changes occur before the cleanup `try/finally`. Exceptions there can leak tracks or leave state changed.
  - Add explicit cancellation if needed; currently a recording has no in-process cancel tool. All mutations are serialized and an operation timeout closes the session.
  - Acceptance: inject constructor/start/draw/encoder errors, cancellation, timeout and browser closure. Stop tracks, clear timers/observers, restore camera/photo/recording state when the page survives, and allow a subsequent operation or clear restart. Test repeated recordings.

- [ ] **Test lifecycle and mutation atomicity.**
  - Inspect CLI interruption and MCP EOF/SIGINT/SIGTERM, queued work during close, timeout/reopen and startup failure. Do not assume `finally` alone handles process signals.
  - Validate all transform prerequisites before modifying position/scale/rotation; a missing quaternion can currently fail after earlier fields mutate. Test failure rollback or explicitly document transactional limits.
  - Acceptance: no orphan browser, stale open flag, incomplete output or silently half-applied operation in covered failure cases. Keep the already-fixed seek-without-frame validation before clip selection.

- [ ] **Expand path/network and cross-platform regression coverage.**
  - Cover Windows drive/UNC paths, separators, symlinks/junctions, existing outputs, permission failures, input limits, redirects, popups, WebSockets and external GLB resources.
  - Acceptance: no escape from the selected workspace and no unauthorized external requests. Document the trusted-local-process threat model; do not claim this is a hardened sandbox for malicious local processes or app code.
  - Ensure CI fails rather than silently skips when browser coverage is required.

## P2: useful extensions after P0/P1

- [ ] **Make multi-step recipes usable with imported models.**
  - Add safe result references or aliases so a recipe can act on an entity created earlier. Current recipes cannot refer dynamically to returned IDs.
  - Acceptance: import → pose/transform → camera → capture works without guessed IDs; reject unresolved/ambiguous references. Keep an explicit operation allowlist, never eval.

- [ ] **Add intentional video framing controls.**
  - Current video uses full canvas aspect, fixed session viewport 1280×720, 720/1080 height, 1–30 seconds, still/orbit/sway, WebM only and no audio.
  - Consider portrait/square viewport or photo-aspect crop, object turntables and configurable camera paths.
  - Acceptance: aspect/dimensions and framing tests plus visible samples; maintain MIME accuracy and realtime/non-deterministic disclosure. Treat MP4/audio/offline rendering as separate scope, not implied capabilities.

- [ ] **Evaluate editable-project save/open only with dedicated safety design.**
  - Upstream project snapshot/ZIP APIs are module-level; they are not exposed as stable window methods. Raw restore resets scene/history and does not coordinate the UI project identity/autosave lifecycle.
  - Acceptance before adding support: versioned adapter usable in production, dedicated context, explicit replace semantics, archive/schema/size/path validation, controlled resource URLs, missing-assets reporting and round-trip tests. Do not add an unsafe generic ZIP loader as a shortcut.

## Completion report expected from the next implementation pass

- [ ] List changes, actual upstream SHA/build mode, test commands/results and the new commit/CI link.
- [ ] Separate fixture tests from real-editor tests; report any skipped/failed/not-run stage plainly.
- [ ] Include only synthetic or licensed shareable artifacts and their dimensions/duration where relevant.
- [ ] Update these checkboxes and README to match evidence; leave unimplemented enhancements unchecked.
