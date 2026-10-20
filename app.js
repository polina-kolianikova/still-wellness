import { initWaterExperience } from './water-scene.js';
const $ = selector => document.querySelector(selector);
const clamp = (n,a=0,b=1) => Math.min(b,Math.max(a,n));
const smooth = n => { const x=clamp(n);return x*x*(3-2*x); };
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
initWaterExperience(reduced);
if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js-ready');
  const reveal=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');reveal.unobserve(entry.target);}}),{threshold:.15});
  document.querySelectorAll('[data-reveal]').forEach(element=>reveal.observe(element));
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

document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&running){
    elapsed=Math.min(duration,(performance.now()-startedAt)/1000);running=false;cancelAnimationFrame(sessionRAF);
    $('#session-toggle').innerHTML='continue your moment <span aria-hidden="true">↗</span>';
    announce('Your practice is paused while you are away. Continue when you are ready.');paintSession();
  }
});
