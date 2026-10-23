import * as THREE from "./assets/vendor/three.module.js?v=ce1fa418de16a19495a9f72495580e3015d7745c296d3ce0485897f902ddedfb";

export function initWaterExperience(reduced) {
  const $ = (selector) => document.querySelector(selector);
  const stage = $(".water-stage"),
    story = $(".water-story"),
    host = $("#water-canvas");
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const smooth = (value) => {
    const p = clamp(value);
    return p * p * (3 - 2 * p);
  };
  let renderer,
    scene,
    camera,
    water,
    drop,
    basin,
    raf = 0,
    frames = 0,
    progress = 0;
  let onscreen = true,
    contextLost = false,
    activeUntil = 0,
    lastFrame = 0,
    slowFrames = 0;
  let dpr = Math.min(devicePixelRatio, innerWidth <= 650 ? 1.25 : 1.5);
  let mode = "idle";
  const pointer = new THREE.Vector2(),
    hit = new THREE.Vector3(),
    ray = new THREE.Raycaster();
  function diagnostics(next = mode, force = false) {
    const changed = next !== mode;
    mode = next;
    if (!force && !changed && frames % 15 !== 0) return;
    const data = document.documentElement.dataset;
    data.renderFrames = String(frames);
    data.drawCalls = String(renderer?.info.render.calls || 0);
    data.triangles = String(renderer?.info.render.triangles || 0);
    data.renderDpr = dpr.toFixed(2);
    data.renderMode = mode;
  }
  const vertex = `
    precision highp float;
    uniform float uProgress,uClock; uniform vec3 uTouch;
    varying vec3 vWorld,vNormal; varying vec2 vSurface;
    const float PI=3.14159265359;
    vec3 surface(vec2 q){
      float a=q.x*PI*2.;float r=max(.004,q.y*4.72);
      vec2 xz=vec2(cos(a),sin(a))*r;
      float impact=smoothstep(.17,.32,uProgress)*(1.-smoothstep(.79,1.,uProgress));
      float front=mix(.15,5.8,clamp((uProgress-.19)/.66,0.,1.));
      float band=exp(-pow((r-front)*1.48,2.));
      float y=sin((r-front)*5.3-.6)*band*.36*impact;
      y+=sin(r*8.-uProgress*14.)*.028*exp(-r*.45)*impact;
      float age=max(0.,uClock-uTouch.z);float distance=length(xz-uTouch.xy);
      float touch=sin(distance*7.5-age*5.2)*exp(-distance*.5)*exp(-age*.9)*smoothstep(0.,.12,age);
      y+=touch*.22;
      y+=sin(xz.x*.85+xz.y*.65)*.008;
      return vec3(xz.x,y,xz.y);
    }
    void main(){
      vec3 p=surface(uv),a=surface(uv+vec2(.0007,0.)),b=surface(uv+vec2(0.,.0007));
      vec3 n=normalize(cross(b-p,a-p)+vec3(0.,.00000001,0.));
      vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*n);vSurface=p.xz;
      gl_Position=projectionMatrix*viewMatrix*world;
    }
  `;
  const fragment = `
    precision highp float;
    varying vec3 vWorld,vNormal;varying vec2 vSurface;
    void main(){
      vec3 N=normalize(vNormal);vec3 V=normalize(cameraPosition-vWorld);if(dot(N,V)<0.)N=-N;
      float fresnel=pow(1.-max(dot(N,V),0.),3.);
      vec3 L=normalize(vec3(-.7,1.6,.8));
      float spec=pow(max(dot(reflect(-L,N),V),0.),110.);
      vec2 p=vSurface;
      float a=sin(p.x*5.8+sin(p.y*4.3)*.8);float b=sin(p.y*6.1+sin(p.x*3.9)*.9);
      float caustic=pow(max(0.,1.-abs(a+b)*.75),10.)*.14;
      float edge=smoothstep(4.1,4.72,length(p));
      vec3 base=mix(vec3(.36,.61,.70),vec3(.72,.85,.89),edge*.65+fresnel*.65);
      base+=vec3(.24,.29,.29)*caustic;
      base*=.86+max(dot(N,L),0.)*.18;
      base+=vec3(.8,.9,.96)*spec*.85;
      base+=vec3(.09,.14,.17)*smoothstep(.08,.5,N.z)*.4;
      gl_FragColor=vec4(base,1.);
    }
  `;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0xe7eef2, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    host.append(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8faabd, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(-5, 9, 4);
    scene.add(light);
    basin = new THREE.Group();
    scene.add(basin);
    const rimMaterial = new THREE.MeshLambertMaterial({ color: 0xd9e6ec });
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(4.81, 4.72, 0.19, 112, 1, true),
      rimMaterial,
    );
    wall.position.y = -0.1;
    basin.add(wall);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(4.76, 0.055, 8, 112),
      rimMaterial,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.005;
    basin.add(rim);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uProgress: { value: 0 },
        uClock: { value: 0 },
        uTouch: { value: new THREE.Vector3(0, 0, -100) },
      },
      side: THREE.DoubleSide,
    });
    water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 144, 64), material);
    water.frustumCulled = false;
    basin.add(water);
    const dropletGeometry = new THREE.SphereGeometry(0.16, 28, 22);
    const a = dropletGeometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const y = a.getY(i);
      const taper = 1 - Math.pow((y + 0.16) / 0.32, 2.2) * 0.5;
      a.setXYZ(i, a.getX(i) * taper, y * 1.65, a.getZ(i) * taper);
    }
    dropletGeometry.computeVertexNormals();
    drop = new THREE.Mesh(
      dropletGeometry,
      new THREE.MeshPhongMaterial({
        color: 0xb9deed,
        specular: 0xffffff,
        shininess: 120,
      }),
    );
    basin.add(drop);
    renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(raf);
      raf = 0;
      document.documentElement.classList.remove("has-webgl");
      diagnostics("idle", true);
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      contextLost = false;
      document.documentElement.classList.add("has-webgl");
      resize();
      requestPaint();
    });
    document.documentElement.classList.add("has-webgl");
    resize();
  } catch (error) {
    console.info("STILL uses its static water composition:", error.message);
    renderer?.dispose();
    renderer = undefined;
  }
  function resize() {
    if (!renderer) return;
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
  }
  function updateStory() {
    const rect = story.getBoundingClientRect();
    progress = reduced.matches
      ? 0
      : clamp(-rect.top / Math.max(1, story.offsetHeight - stage.clientHeight));
    const landscape = matchMedia("(max-height: 500px) and (pointer: coarse)").matches;
    const out = landscape ? 0 : smooth((progress - 0.06) / 0.28);
    const copy = $(".hero-copy");
    copy.style.opacity = String(1 - out);
    copy.style.transform = `translate3d(0,${-out * 40}px,0)`;
    copy.style.visibility = out > 0.999 ? "hidden" : "visible";
    copy.inert = out > 0.92;
    const second = smooth((progress - 0.51) / 0.24);
    $(".second-copy").style.opacity = String(second);
    $(".second-copy").style.transform =
      `translate3d(0,${(1 - second) * 25}px,0)`;
    $(".water-caption").style.opacity = String(
      1 - smooth((progress - 0.17) / 0.3),
    );
    $(".scene-label").textContent =
      progress > 0.5 ? "STILLNESS / 02" : "TOUCH THE SURFACE / 01";
  }
  function render(now) {
    raf = 0;
    if (document.hidden) {
      diagnostics("hidden", true);
      return;
    }
    if (!onscreen) {
      diagnostics("offscreen", true);
      return;
    }
    updateStory();
    if (renderer && !contextLost) {
      const p = smooth(progress);
      const mobile = stage.clientWidth <= 650;
      basin.position.set(0, mobile ? -1.1 : -1.0, 0);
      camera.position.set(
        0,
        7.2 + p * 3.5,
        mobile ? 10.8 - p * 4.3 : 9.4 - p * 4.9,
      );
      camera.lookAt(0, -0.75, 0);
      if (mobile) camera.zoom = 0.7;
      else camera.zoom = 1;
      camera.updateProjectionMatrix();
      water.material.uniforms.uProgress.value = p;
      water.material.uniforms.uClock.value = reduced.matches ? 0 : now * 0.001;
      const falling = smooth((p - 0.09) / 0.24);
      drop.position.set(0, 1.55 * (1 - falling) + 0.08, 0);
      drop.scale.setScalar(1 - smooth((p - 0.3) / 0.1));
      renderer.render(scene, camera);
      frames++;
      const delta = now - lastFrame;
      if (now < activeUntil && delta > 26 && delta < 110) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames >= 10 && dpr > 0.9) {
        dpr = Math.max(0.9, dpr - 0.15);
        renderer.setPixelRatio(dpr);
        resize();
        slowFrames = 0;
      }
      lastFrame = now;
    }
    if (!reduced.matches && now < activeUntil && renderer && !contextLost) {
      diagnostics("active");
      raf = requestAnimationFrame(render);
    } else diagnostics("idle", true);
  }
  function requestPaint() {
    if (document.hidden) {
      diagnostics("hidden", true);
      return;
    }
    if (!onscreen) {
      diagnostics("offscreen", true);
      return;
    }
    if (!raf) raf = requestAnimationFrame(render);
  }
  function ripple(x = 0, z = 0) {
    if (reduced.matches || !renderer || !onscreen || document.hidden) return;
    const now = performance.now();
    water.material.uniforms.uTouch.value.set(x, z, now * 0.001);
    activeUntil = now + 3400;
    lastFrame = 0;
    requestPaint();
  }
  let lastPointer = 0;
  stage.addEventListener(
    "pointermove",
    (event) => {
      if (
        event.target.closest("a,button") ||
        (event.pointerType === "touch" && !event.buttons)
      )
        return;
      const now = performance.now();
      if (now - lastPointer < 110 || !renderer || reduced.matches) return;
      lastPointer = now;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const plane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        -basin.position.y,
      );
      if (ray.ray.intersectPlane(plane, hit) && Math.hypot(hit.x, hit.z) < 4.5)
        ripple(hit.x, hit.z);
    },
    { passive: true },
  );
  $(".ripple-button").addEventListener("click", () => ripple());
  window.addEventListener("scroll", requestPaint, { passive: true });
  window.addEventListener("resize", () => {
    resize();
    requestPaint();
  });
  function motionCopy() {
    $(".water-caption p").innerHTML = reduced.matches
      ? "a quiet surface.<br>room for a little stillness."
      : "move across the water.<br>or make a little ripple.";
  }
  motionCopy();
  reduced.addEventListener("change", () => {
    activeUntil = 0;
    motionCopy();
    requestPaint();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      diagnostics("hidden", true);
    } else requestPaint();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        onscreen = entries[0].isIntersecting;
        if (!onscreen) {
          cancelAnimationFrame(raf);
          raf = 0;
          diagnostics("offscreen", true);
        } else requestPaint();
      },
      { threshold: 0 },
    ).observe(stage);
  }
  diagnostics("idle", true);
  requestPaint();
}
