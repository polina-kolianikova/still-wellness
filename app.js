import * as THREE from './assets/vendor/three.module.js';

const $ = (selector) => document.querySelector(selector);
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const smooth = (n) => { const x = clamp(n); return x * x * (3 - 2 * x); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('.water-stage');
const story = $('.water-story');
let sceneProgress = 0;
let visible = true;
let renderer, scene, camera, waterGroup, surface, droplet, shadow, rippleA, rippleB;

function environmentTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#f7fcff'); gradient.addColorStop(.34, '#d8eaf3'); gradient.addColorStop(.49, '#f8ffff'); gradient.addColorStop(.52, '#416a83'); gradient.addColorStop(.8, '#a2bfd0'); gradient.addColorStop(1, '#e3eef5');
  context.fillStyle = gradient; context.fillRect(0, 0, 1024, 512);
  context.fillStyle = '#ffffff'; context.fillRect(100, 30, 120, 290); context.fillRect(590, 50, 80, 280);
  context.fillStyle = '#163e59'; context.fillRect(340, 150, 70, 230); context.fillRect(810, 170, 50, 180);
  const texture = new THREE.CanvasTexture(canvas); texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

const vertexShader = `
  precision highp float;
  uniform float uProgress; uniform float uTime;
  varying vec3 vWorld; varying vec3 vNormal;
  const float PI = 3.14159265359;
  vec3 shape(vec2 q) {
    float a=q.x*PI*2.0; float b=q.y*PI*2.0;
    float p=uProgress;
    float radius=mix(1.46,2.05,p);
    float tube=mix(.54,.075,p);
    float variation=(sin(a*3.0+.8)*.12+cos(a*2.0-1.3)*.095)*(1.0-p);
    float r=radius+cos(b)*tube+variation;
    float y=sin(b)*tube*.96+sin(a*2.0+.3)*.13*(1.0-p);
    y+=sin(a*4.0+b*.8+uTime*.22)*.023*(1.0-p*.6);
    return vec3(cos(a)*r,y,sin(a)*r);
  }
  void main() {
    vec3 p=shape(uv); vec3 pu=shape(uv+vec2(.001,0.0)); vec3 pv=shape(uv+vec2(0.0,.001));
    vec3 n=normalize(cross(pv-p,pu-p));
    vec4 world=modelMatrix*vec4(p,1.0);
    vWorld=world.xyz; vNormal=normalize(mat3(modelMatrix)*n);
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;
const fragmentShader = `
  precision highp float;
  uniform sampler2D uEnvironment;
  varying vec3 vWorld; varying vec3 vNormal;
  const float PI=3.14159265359;
  void main() {
    vec3 N=normalize(vNormal); vec3 V=normalize(cameraPosition-vWorld);
    if(dot(N,V)<0.0) N=-N;
    vec3 R=reflect(-V,N);
    vec2 e=vec2(atan(R.z,R.x)/(PI*2.0)+.5,asin(clamp(R.y,-1.0,1.0))/PI+.5);
    vec3 env=texture2D(uEnvironment,e).rgb;
    float fresnel=pow(1.0-max(dot(N,V),0.0),3.5);
    float diffuse=max(dot(N,normalize(vec3(-.5,1.0,1.2))),0.0);
    float highlight=pow(max(dot(reflect(normalize(vec3(.6,-1.0,-1.0)),N),V),0.0),80.0);
    vec3 color=mix(vec3(.24,.48,.61),env,.79);
    color*=.68+diffuse*.36;
    color+=vec3(.21,.28,.32)*fresnel+vec3(.8,.9,1.0)*highlight*.5;
    gl_FragColor=vec4(color,1.0);
  }
`;

function initScene() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, window.innerWidth <= 650 ? 1.5 : 1.75));
    renderer.setClearColor(0xe7eef2, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    $('#water-canvas').appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); document.documentElement.classList.remove('has-webgl'); cancelAnimationFrame(sceneRAF); sceneRAF = 0; });
    renderer.domElement.addEventListener('webglcontextrestored', () => { document.documentElement.classList.add('has-webgl'); resizeScene(); updateStory(); resumeScene(); });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, .1, 60);
    const environment = environmentTexture();
    scene.environment = environment;
    scene.add(new THREE.HemisphereLight(0xf7fcff, 0x45657b, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(-4, 7, 6); scene.add(light);
    const back = new THREE.DirectionalLight(0x92c6e8, 2); back.position.set(4, 1, -4); scene.add(back);
    waterGroup = new THREE.Group(); scene.add(waterGroup);
    const geometry = new THREE.PlaneGeometry(1, 1, 160, 40);
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uEnvironment: { value: environment } }, side: THREE.DoubleSide });
    surface = new THREE.Mesh(geometry, material); surface.frustumCulled = false; waterGroup.add(surface);
    const dropGeometry = new THREE.SphereGeometry(.26, 36, 26);
    const positions = dropGeometry.attributes.position;
    for (let index = 0; index < positions.count; index++) { const y = positions.getY(index); const t = (y + .26) / .52; const taper = 1 - Math.pow(t, 2.7) * .55; positions.setXYZ(index, positions.getX(index) * taper, y * 1.48, positions.getZ(index) * taper); }
    dropGeometry.computeVertexNormals();
    const dropMaterial = new THREE.MeshPhysicalMaterial({ color: 0x92b9cb, metalness: .75, roughness: .08, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.25 });
    droplet = new THREE.Mesh(dropGeometry, dropMaterial); waterGroup.add(droplet);
    const rippleMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9dbdce, metalness: .48, roughness: .16, envMapIntensity: 1.1, transparent: true, opacity: 0 });
    rippleA = new THREE.Mesh(new THREE.TorusGeometry(1, .014, 10, 140), rippleMaterial); rippleA.rotation.x = Math.PI / 2; waterGroup.add(rippleA);
    rippleB = new THREE.Mesh(new THREE.TorusGeometry(1, .008, 8, 140), rippleMaterial.clone()); rippleB.rotation.x = Math.PI / 2; waterGroup.add(rippleB);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d'); const grad = ctx.createRadialGradient(64,64,0,64,64,64); grad.addColorStop(0,'rgba(43,83,106,.19)'); grad.addColorStop(.45,'rgba(43,83,106,.09)'); grad.addColorStop(1,'rgba(43,83,106,0)'); ctx.fillStyle=grad; ctx.fillRect(0,0,128,128);
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(7,7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent:true, depthWrite:false })); shadow.rotation.x=-Math.PI/2; shadow.position.y=-.85; scene.add(shadow);
    document.documentElement.classList.add('has-webgl');
    resizeScene();
  } catch (error) {
    console.info('STILL: using the static water composition.', error.message);
    if (renderer) renderer.dispose(); renderer = undefined;
  }
}

function resizeScene() {
  if (!renderer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const mobile = w <= 650;
  camera.position.set(0, mobile ? 3.1 : 3.2, mobile ? 11.6 : 8.8);
  camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
}
function updateStory() {
  const max = Math.max(1, story.offsetHeight - innerHeight);
  sceneProgress = reduced.matches ? 0 : clamp(-story.getBoundingClientRect().top / max);
  const out = smooth(sceneProgress / .42);
  $('.hero-copy').style.opacity = String(1 - out);
  $('.hero-copy').style.transform = `translateY(${-out * 55}px)`;
  $('.hero-copy').style.visibility = out >= .999 ? 'hidden' : 'visible';
  const second = smooth((sceneProgress - .49) / .22);
  $('.second-copy').style.opacity = String(second);
  $('.second-copy').style.transform = `translateY(${(1 - second) * 40}px)`;
  $('.water-caption').style.opacity = String(1 - smooth(sceneProgress / .3));
  $('.scene-label').textContent = sceneProgress > .55 ? 'STILLNESS / 02' : 'SURFACE / 01';
  if (renderer && reduced.matches) renderScene(0);
}
function renderScene(time) {
  if (!renderer) return;
  const p = smooth((sceneProgress - .08) / .82);
  const mobile = stage.clientWidth <= 650;
  waterGroup.position.set((mobile ? .32 : 1.72) * (1 - p), mobile ? -.95 - p * .25 : -.04 - p * .25, 0);
  waterGroup.rotation.x = .96 * (1 - p);
  waterGroup.rotation.y = -.33 * (1 - p);
  waterGroup.rotation.z = -.2 * (1 - p);
  const scale = mobile ? .86 : 1.03; waterGroup.scale.setScalar(scale);
  surface.material.uniforms.uProgress.value = p;
  surface.material.uniforms.uTime.value = reduced.matches ? 0 : time;
  droplet.position.set(.03, 1.48 - p * 2.1, .04);
  droplet.scale.setScalar(Math.max(.001, 1 - smooth((p - .5) / .19)));
  rippleA.scale.setScalar(.65 + p * 2.1); rippleA.position.y = -.03; rippleA.material.opacity = smooth((p - .55) / .35) * .45;
  rippleB.scale.setScalar(.45 + p * 2.75); rippleB.position.y = -.04; rippleB.material.opacity = smooth((p - .66) / .3) * .23;
  shadow.position.x = waterGroup.position.x; shadow.position.y = mobile ? -1.5 : -.85;
  renderer.render(scene, camera);
}
let sceneRAF = 0;
function sceneLoop(time) {
  sceneRAF = 0;
  if (visible && !document.hidden) renderScene(time * .001);
  if (!reduced.matches && visible && !document.hidden && renderer) sceneRAF = requestAnimationFrame(sceneLoop);
}
function resumeScene() { if (!sceneRAF && renderer) sceneRAF = requestAnimationFrame(sceneLoop); }
initScene(); updateStory(); resumeScene();
window.addEventListener('scroll', updateStory, { passive:true });
window.addEventListener('resize', () => { resizeScene(); updateStory(); if (renderer) renderScene(0); });
reduced.addEventListener('change', () => { updateStory(); resumeScene(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeScene(); });
if ('IntersectionObserver' in window) {
  const sceneObserver = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) resumeScene(); }, { rootMargin: '100px' }); sceneObserver.observe(story);
  document.documentElement.classList.add('js-ready');
  const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('visible'); reveal.unobserve(entry.target); } }), { threshold:.15 }); document.querySelectorAll('[data-reveal]').forEach((element) => reveal.observe(element));
}

const rituals = { arrive: { name:'arrive', inhale:4, exhale:6 }, steady: { name:'steady', inhale:4, exhale:4 }, unwind: { name:'unwind', inhale:3, exhale:5 } };
let ritual = rituals.arrive;
let duration = 60;
let elapsed = 0;
let running = false;
let completed = false;
let startedAt = 0;
let sessionRAF = 0;
let currentPhase = '';
const circleLength = 2 * Math.PI * 164;
function formatTime(seconds) { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`; }
function announce(message) { $('#session-status').textContent = message; }
function paintSession() {
  const remaining = Math.max(0, duration - elapsed);
  const cycleLength = ritual.inhale + ritual.exhale;
  const cycle = elapsed % cycleLength;
  const inhale = cycle < ritual.inhale;
  const phaseDuration = inhale ? ritual.inhale : ritual.exhale;
  const phaseElapsed = inhale ? cycle : cycle - ritual.inhale;
  const phase = inhale ? 'breathe in' : 'breathe out';
  const fraction = clamp(phaseElapsed / phaseDuration);
  const openness = inhale ? smooth(fraction) : 1 - smooth(fraction);
  $('#breathing-visual').style.setProperty('--breath-scale', String(.82 + openness * .28));
  $('#session-progress').style.strokeDashoffset = String(circleLength * (1 - elapsed / duration));
  $('#time-remaining').textContent = `${formatTime(remaining)} remaining`;
  $('#cycle-label').textContent = elapsed > 0 ? `breath ${Math.floor(elapsed / cycleLength) + 1}` : 'a little space for yourself';
  if (running) {
    $('#phase-label').textContent = phase;
    $('#phase-count').textContent = String(Math.max(1, Math.ceil(phaseDuration - phaseElapsed))).padStart(2,'0');
    $('#phase-helper').textContent = inhale ? 'MAKE A LITTLE ROOM' : 'LET A LITTLE GO';
    if (currentPhase !== phase) { currentPhase = phase; announce(`${phase}. ${phaseDuration} seconds.`); }
  } else if (completed) {
    $('#phase-label').textContent = 'a little more present'; $('#phase-count').textContent = 'thank you'; $('#phase-count').style.fontSize = 'clamp(34px,4vw,58px)'; $('#phase-helper').textContent = 'TAKE THIS PACE WITH YOU'; $('#cycle-label').textContent = 'your moment, complete';
  } else {
    $('#phase-label').textContent = elapsed > 0 ? 'take your time' : 'be here'; $('#phase-count').textContent = formatTime(remaining); $('#phase-helper').textContent = elapsed > 0 ? 'YOUR PRACTICE IS PAUSED' : 'YOUR TIME BEGINS WHEN YOU DO';
  }
}
function tickSession(now) {
  if (!running) return;
  elapsed = Math.min(duration, (now - startedAt) / 1000);
  if (elapsed >= duration) {
    running = false; completed = true; $('#session-toggle').innerHTML = 'begin again <span aria-hidden="true">↗</span>'; announce('Your moment is complete. Take your time.'); paintSession(); return;
  }
  paintSession(); sessionRAF = requestAnimationFrame(tickSession);
}
function resetSession(silent = false) {
  running = false; cancelAnimationFrame(sessionRAF); elapsed = 0; completed = false; currentPhase = '';
  $('#phase-count').style.fontSize = '';
  $('#session-toggle').innerHTML = 'begin your moment <span aria-hidden="true">↗</span>';
  $('#practice-mode').textContent = `${ritual.name.toUpperCase()} / ${ritual.inhale} IN · ${ritual.exhale} OUT`;
  paintSession(); if (!silent) announce(`Ready for a ${duration / 60} minute ${ritual.name} practice.`);
}
$('#session-toggle').addEventListener('click', () => {
  if (running) { elapsed = Math.min(duration, (performance.now() - startedAt) / 1000); running = false; cancelAnimationFrame(sessionRAF); $('#session-toggle').innerHTML = 'continue your moment <span aria-hidden="true">↗</span>'; announce('Practice paused. Continue whenever you are ready.'); paintSession(); return; }
  if (completed) resetSession(true);
  running = true; currentPhase = ''; startedAt = performance.now() - elapsed * 1000; $('#session-toggle').innerHTML = 'pause a moment <span aria-hidden="true">Ⅱ</span>'; sessionRAF = requestAnimationFrame(tickSession);
});
$('#session-reset').addEventListener('click', () => resetSession());
document.querySelectorAll('[data-duration]').forEach((button) => button.addEventListener('click', () => { duration = Number(button.dataset.duration); document.querySelectorAll('[data-duration]').forEach((element) => element.setAttribute('aria-pressed', String(element === button))); resetSession(); }));
function chooseRitual(key, focus = false) { ritual = rituals[key]; document.querySelectorAll('[data-ritual]').forEach((button) => { const selected = button.dataset.ritual === key; button.setAttribute('aria-checked', String(selected)); button.tabIndex = selected ? 0 : -1; if (selected && focus) button.focus(); }); resetSession(); }
const ritualKeys = Object.keys(rituals);
document.querySelectorAll('[data-ritual]').forEach((button) => { button.addEventListener('click', () => chooseRitual(button.dataset.ritual)); button.addEventListener('keydown', (event) => { const index = ritualKeys.indexOf(button.dataset.ritual); let next; if (['ArrowDown','ArrowRight'].includes(event.key)) next = (index + 1) % ritualKeys.length; if (['ArrowUp','ArrowLeft'].includes(event.key)) next = (index + ritualKeys.length - 1) % ritualKeys.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = ritualKeys.length - 1; if (next !== undefined) { event.preventDefault(); chooseRitual(ritualKeys[next], true); } }); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && running) { elapsed = Math.min(duration, (performance.now() - startedAt) / 1000); running = false; cancelAnimationFrame(sessionRAF); $('#session-toggle').innerHTML = 'continue your moment <span aria-hidden="true">↗</span>'; announce('Practice paused.'); paintSession(); } });
resetSession(true);
