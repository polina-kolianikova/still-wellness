# STILL

Independent static recovery studio concept. No account, backend, remote font or external runtime is required. Serve over local HTTP and open `index.html`.

Three.js is vendored locally. The opening is a wide sculptural water landscape viewed from above. Native scroll lowers a droplet, sends a wave through the same surface and brings the camera toward a quiet overhead view. The pointer or “touch the water” button makes a short lived local ripple. No wheel interception or mandatory playback.

Three rituals and 1, 3 or 5 minute durations are functional local breathing practices. Start, pause, resume and reset work. Escape pauses an active practice. Arrow keys, Home and End select rituals. Time and state stay in memory and are never transmitted. Selecting a different duration or ritual resets the practice explicitly.

Reduced motion presents a still water composition and a non-scaling breathing guide. WebGL failure reveals a CSS water composition while all content and practice controls remain usable. The scene is rendered on demand. A ripple permits at most 3.4 seconds of animation, then RAF stops. Hidden and offscreen scenes cancel it immediately. DPR begins at a maximum of 1.5 desktop or 1.25 mobile and adapts downward when consecutive active frame intervals are slow. Shadow maps and full screen noise are absent. Active breathing pauses when the tab is hidden.

For an independent GitHub Pages repository, put this directory at the repository root. Paths are relative and `.nojekyll` is included. See `assets/LICENSES.md` for font and Three.js licences.

Runtime diagnostics are available on `document.documentElement.dataset`: `renderFrames` counts real `renderer.render()` calls, `drawCalls` and `triangles` are from Three.js render info, `renderDpr` is actual pixel ratio and `renderMode` is active, idle, hidden or offscreen. They update every 15 active frames or at a mode change/pause.
