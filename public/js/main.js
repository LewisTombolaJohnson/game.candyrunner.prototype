import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { Game } from './logic.js';
import { UIOverlay } from './ui.js';

// Hybrid flow: Door choice -> doors open & slide out -> obstacle run animation -> result -> next doors

const ui = new UIOverlay();
ui.showStart();
console.debug('[main] UI initialized, waiting for Start click');

let scene, camera, renderer, playerMesh;
let trackGroup = null; // container for moving track elements (floor, sweets, coins)
const laneX = [-2, 0, 2];
let doors = []; // { frame, panel, lane, obstacle }
let game = null;
let playerLane = 1;

// Timing configuration
let revealDelay = 0.5;          // delay after click before doors open
let doorOpenDuration = 0.9;     // duration of door opening rotation
let doorSlideDuration = 0.6;    // after opening, slide out duration
let totalDoorTravelDuration = doorOpenDuration + doorSlideDuration; // used for linear forward motion
let runDuration = 3.5;          // obstacle travel time until obstacle reaches player
let passDuration = 1.5;         // additional time for obstacle to travel past player before checkpoint result (only if safe)
let resultPause = 1.0;          // pause showing result before next doors

// Distances
let obstacleStartZ = -55;
let obstacleEndZ = 2;           // player position Z
let obstaclePastZ = 20;         // when obstacle considered offscreen/past
let doorBaseZ = -25;            // starting Z for doors (approach toward player)
// Doors now stop further back so player passes through gap without doors appearing to stick
// Compromise target: close enough for presence but behind player so they don't block
let doorTargetZ = obstacleEndZ - 3.2; // tweak from -6 to -3.2 to reduce early visual pause
// Cull constant no longer needed for push-off logic
// const doorCullZ = obstacleEndZ + 5;

// State machine
// States: 'await-choice' | 'pre-open' | 'doors-opening' | 'doors-sliding' | 'running' | 'result' | 'ended'
let state = 'idle';
let stateTime = 0;
let chosen = false;
// Timestamp of previous frame for delta time calculation
let lastTs = performance.now();

let obstacleMesh = null; // active obstacle in run phase
let preSpawnObstacle = null; // hidden obstacle created during door phase
let choiceResolved = false; // whether scoring done this segment
let coins = []; // {mesh, lane, taken, appearTime}
let coinGroup = null;
let floatingTexts = []; // {mesh, t, duration}
let particles = []; // {mesh, t, duration}
let sweets = []; // environment candy objects {mesh, speed}
let sweetsGroup = null;
let preSpawnDoors = null; // next checkpoint doors
let preSpawnCreated = false;
let preSpawnStartZ = null;
let lastDoorZ = null; // previous frame door reference Z for map sync

// Hoisted helper: pick x outside lane centers so sweets avoid lanes
function randomSweetX(){
  while(true){
    const x = (Math.random()-0.5) * 20; // -10..10
    if (!laneX.some(lx => Math.abs(x - lx) < 1.2)) return x;
  }
}

// Candy palette
const CANDY_COLORS = [0xffb3ba,0xffdfba,0xffffba,0xbaffc9,0xbae1ff,0xe5b3ff,0xffbaf4];
function randCandyColor(){ return CANDY_COLORS[Math.floor(Math.random()*CANDY_COLORS.length)]; }

function buildGumdrop() {
  const geo = new THREE.SphereGeometry(0.9, 20, 20);
  // Flatten base
  geo.vertices?.forEach?.(()=>{}); // (Three r160 uses buffer geometry; skipping vertex flatten for brevity)
  const mat = new THREE.MeshStandardMaterial({ color: randCandyColor(), roughness:0.6, metalness:0.05 });
  const m = new THREE.Mesh(geo, mat);
  m.scale.y = 0.8;
  return m;
}

function buildLollipop() {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,1.8,12), new THREE.MeshStandardMaterial({ color:0xffffff }));
  stick.position.y = 0.9;
  group.add(stick);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 18), new THREE.MeshStandardMaterial({ color: randCandyColor(), emissive:0x111111 }));
  head.position.y = 1.9;
  group.add(head);
  return group;
}

function buildCandyCane() {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,2.2,16), new THREE.MeshStandardMaterial({ color:0xffffff }));
  shaft.position.y = 1.1;
  group.add(shaft);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.5,0.15,12,24,Math.PI), new THREE.MeshStandardMaterial({ color:0xff3344 }));
  hook.position.set(0,2.2,0.25);
  hook.rotation.z = Math.PI;
  group.add(hook);
  return group;
}

function buildDonut() {
  return new THREE.Mesh(new THREE.TorusGeometry(0.6,0.25,14,24), new THREE.MeshStandardMaterial({ color: randCandyColor(), emissive:0x220022 }));
}

function initSweets() {
  if (sweetsGroup) trackGroup.remove(sweetsGroup);
  sweetsGroup = new THREE.Group();
  sweets = [];
  const total = 60;
  for (let i=0;i<total;i++) {
    let builder;
    const r = Math.random();
    if (r < 0.25) builder = buildGumdrop; else if (r < 0.5) builder = buildLollipop; else if (r < 0.75) builder = buildCandyCane; else builder = buildDonut;
    const mesh = builder();
    const x = randomSweetX();
    const y = Math.random()*0.5;
    const z = -20 - Math.random()*180;
    mesh.position.set(x,y,z);
    mesh.rotation.y = Math.random()*Math.PI*2;
    const spin = (Math.random()*0.6 + 0.2) * (Math.random()<0.5?1:-1);
    mesh.userData.spin = spin;
    sweetsGroup.add(mesh);
    sweets.push({ mesh, speed: 4 + Math.random()*2 });
  }
  trackGroup.add(sweetsGroup);
}

function updateSweets(dt) {
  if (!sweetsGroup) return;
  for (const c of sweets) {
    c.mesh.position.z += c.speed * dt;
    c.mesh.rotation.y += c.mesh.userData.spin * dt;
    if (c.mesh.position.z > obstacleEndZ + 10) {
      c.mesh.position.z = -120 - Math.random()*120;
      c.mesh.position.x = randomSweetX();
      c.mesh.position.y = Math.random()*0.8;
    }
  }
}

// Audio placeholders (simple oscillator or HTMLAudioElements could be added; using simple dynamic Audio for now)
const sounds = {};
function loadSounds(){
  // Minimal embedded sounds using small base64 data URIs (very short beeps)
  const beepPickup = new Audio('data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
  const beepDoor = new Audio('data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
  const beepFail = new Audio('data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
  sounds.pickup = beepPickup;
  sounds.door = beepDoor;
  sounds.fail = beepFail;
}
loadSounds();

function setState(newState) {
  state = newState;
  stateTime = 0;
}

function buildSkyTexture() {
  const w = 1024, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Vertical gradient (top -> bottom)
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#5aa9ff');
  g.addColorStop(0.55,'#8bc9ff');
  g.addColorStop(1,'#cfe9ff');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);
  // Procedural soft clouds (simple overlapping semi-transparent ellipses)
  const cloudCount = 14;
  for (let i=0;i<cloudCount;i++) {
    const cx = Math.random()*w;
    const cy = Math.random()*h*0.6; // upper 60%
    const scale = 0.5 + Math.random()*1.4;
    const puffCount = 6 + Math.floor(Math.random()*5);
    ctx.globalAlpha = 0.12 + Math.random()*0.08;
    for (let p=0;p<puffCount;p++) {
      const px = cx + (Math.random()-0.5)*160*scale;
      const py = cy + (Math.random()-0.5)*60*scale;
      const rw = (60 + Math.random()*80) * scale;
      const rh = (30 + Math.random()*40) * scale;
      const grd = ctx.createRadialGradient(px,py,0, px,py, rw);
      grd.addColorStop(0,'rgba(255,255,255,0.9)');
      grd.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(px,py,rw,rh,0,0,Math.PI*2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = buildSkyTexture();

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 3.2, 7.2); // closer & lower
  camera.lookAt(0, 1.4, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('game-root').appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(6, 10, 8);
  scene.add(dir);

  // Floor + lanes (for run phase)
  trackGroup = new THREE.Group();
  scene.add(trackGroup);
  const floorGeo = new THREE.PlaneGeometry(40, 160);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffe6f2, roughness:0.9, metalness:0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -60;
  trackGroup.add(floor);

  const laneMat = new THREE.MeshStandardMaterial({ color: 0xffc2d6, emissive:0x331122 });
  for (let i = -1; i <= 1; i += 2) {
    const laneGeo = new THREE.BoxGeometry(0.2, 0.05, 160);
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.position.set(i * 1, 0.01, -60);
    scene.add(lane);
  }

  // Player marker
  const pGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  const pMat = new THREE.MeshStandardMaterial({ color: 0xff66aa, emissive: 0x661133 });
  playerMesh = new THREE.Mesh(pGeo, pMat);
  playerMesh.position.set(laneX[playerLane], 0.5, obstacleEndZ);
  scene.add(playerMesh);

  createDoors();
  initSweets();

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);
}

function createDoors() {
  clearDoors();
  doors = [];
  for (let i = 0; i < 3; i++) {
    // Hollow frame: build from 4 beams (top, left, right, bottom sill)
    const frameGroup = new THREE.Group();
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x444c55 });
    // Dimensions
    const innerWidth = 1.8;
    const innerHeight = 3.6;
    const thickness = 0.18;
    const depth = 0.3;
    // Top beam
    const top = new THREE.Mesh(new THREE.BoxGeometry(innerWidth + thickness*2, thickness, depth), beamMat);
    top.position.set(0, innerHeight/2, 0);
    frameGroup.add(top);
    // Bottom sill (slightly lower)
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(innerWidth + thickness*2, thickness, depth), beamMat);
    bottom.position.set(0, -innerHeight/2, 0);
    frameGroup.add(bottom);
    // Left beam
    const left = new THREE.Mesh(new THREE.BoxGeometry(thickness, innerHeight, depth), beamMat);
    left.position.set(-(innerWidth/2 + thickness/2), 0, 0);
    frameGroup.add(left);
    // Right beam
    const right = new THREE.Mesh(new THREE.BoxGeometry(thickness, innerHeight, depth), beamMat);
    right.position.set(innerWidth/2 + thickness/2, 0, 0);
    frameGroup.add(right);
  frameGroup.position.set(laneX[i], 2, doorBaseZ);
    scene.add(frameGroup);

  // Hinge pivot: left & right doors at outer edges, middle door hinge on its left edge
  const hinge = new THREE.Object3D();
  const hingeOffset = (i === 0) ? -0.8 : (i === 2 ? 0.8 : -0.8);
  hinge.position.set(laneX[i] + hingeOffset, 2, doorBaseZ + 0.11);
  scene.add(hinge);

    const panelGeo = new THREE.BoxGeometry(1.6, 3.2, 0.12);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x6d747c });
    const panel = new THREE.Mesh(panelGeo, panelMat);
  // Offset within hinge; middle door shifts so left edge aligns with hinge
  if (i === 0) panel.position.x = 0.8;
  else if (i === 2) panel.position.x = -0.8;
  else panel.position.x = 0.8;
    hinge.add(panel);

      doors.push({ frame: frameGroup, panel, hinge, lane: i, obstacle: false, openT: 0, slideT: 0, baseZ: doorBaseZ });
  }
}

function clearDoors() {
  for (const d of doors) {
    scene.remove(d.frame);
    if (d.hinge) scene.remove(d.hinge);
    else scene.remove(d.panel);
  }
  doors = [];
}

function clearPreSpawnDoors() {
  if (!preSpawnDoors) return;
  for (const d of preSpawnDoors) {
    scene.remove(d.frame);
    if (d.hinge) scene.remove(d.hinge); else scene.remove(d.panel);
  }
  preSpawnDoors = null;
  preSpawnCreated = false;
  preSpawnStartZ = null;
}

function spawnCoins() {
  // Even spacing per lane: randomly allocate counts per lane then distribute offsets evenly (skip extremities)
  if (coinGroup) trackGroup.remove(coinGroup);
  coinGroup = new THREE.Group();
  coins = [];
  const progress = game ? Math.min(game.currentCheckpoint / game.config.maxCheckpoints, 1) : 0;
  const maxExtra = 6;
  const baseMax = 10;
  const dynamicMax = baseMax + Math.floor(progress * maxExtra);
  const total = Math.floor(Math.random() * dynamicMax) + 1;
  const buckets = [0,0,0];
  for (let i=0;i<total;i++) buckets[Math.floor(Math.random()*3)]++;
  const geo = new THREE.CylinderGeometry(0.35,0.35,0.1,24);
  for (let lane=0; lane<3; lane++) {
    const count = buckets[lane];
    for (let i=0;i<count;i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x7a5c00, metalness:0.55, roughness:0.4 });
      const coin = new THREE.Mesh(geo, mat);
      coin.rotation.x = Math.PI / 2;
      // Even offsets (1..count) mapped into (0,0.85] range to leave initial gap so first coin not at start
      const offset = ((i+1)/(count+1)) * 0.85; // 0..0.85
      coins.push({ mesh: coin, lane, taken: false, offset });
      // Place using world target Z adjusted into trackGroup local space so movement & collision stay aligned
      coin.position.set(laneX[lane], 0.9, (obstacleStartZ - 5) - trackGroup.position.z);
      coinGroup.add(coin);
    }
  }
  trackGroup.add(coinGroup);
}

function removeCoins() {
  if (coinGroup) trackGroup.remove(coinGroup);
  coins = [];
  coinGroup = null;
}

function assignObstacle() {
  const lanes = game.pendingObstacleLanes || [game.pendingObstacleLane];
  doors.forEach(d => d.obstacle = lanes.includes(d.lane));
}

function spawnObstacleMesh(lanes) {
  removeObstacleMesh();
  if (!Array.isArray(lanes)) lanes = [lanes];
  const group = new THREE.Group();
  group.position.set(0,0,obstacleStartZ);
  const geo = new THREE.BoxGeometry(1, 1.4, 1);
  lanes.forEach(lane => {
    if (lane == null) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x330000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(laneX[lane], 0.7, 0); // relative to group
    group.add(mesh);
  });
  scene.add(group);
  obstacleMesh = group;
}

function preSpawnObstacleMesh(lanes) {
  // Create obstacle early but invisible
  if (preSpawnObstacle) { scene.remove(preSpawnObstacle); preSpawnObstacle = null; }
  if (!Array.isArray(lanes)) lanes = [lanes];
  const group = new THREE.Group();
  group.position.set(0,0,obstacleStartZ);
  group.visible = false;
  const geo = new THREE.BoxGeometry(1,1.4,1);
  lanes.forEach(lane => {
    if (lane == null) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x330000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(laneX[lane],0.7,0);
    group.add(mesh);
  });
  scene.add(group);
  preSpawnObstacle = group;
}

function removeObstacleMesh() {
  if (obstacleMesh) scene.remove(obstacleMesh);
  obstacleMesh = null;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKey(e) {
  if (!game || game.isOver()) return;
  if (state === 'await-choice') {
    if (e.key === 'ArrowLeft') setPlayerLane(playerLane - 1);
    else if (e.key === 'ArrowRight') setPlayerLane(playerLane + 1);
    else if (['1','2','3'].includes(e.key)) selectLane(Number(e.key) - 1);
  }
}

// Lane tween variables
let laneTween = null; // {from, to, t, duration}

function setPlayerLane(lane, tween=true) {
  if (lane < 0 || lane > 2) return;
  if (!tween) {
    playerLane = lane;
    if (playerMesh) playerMesh.position.x = laneX[playerLane];
  } else {
    if (playerLane === lane) return;
    laneTween = { from: laneX[playerLane], to: laneX[lane], t: 0, duration: 0.35, targetLane: lane };
    playerLane = lane; // logical lane updates immediately for collision & coin checks
  }
  highlightDoor(lane);
}

function highlightDoor(lane) {
  doors.forEach(d => { d.panel.material.emissive = new THREE.Color(d.lane === lane ? 0x1e90ff : 0x000000); });
}

function selectLane(lane) {
  if (state !== 'await-choice') return;
  setPlayerLane(lane);
  chosen = true;
  ui.hideControls('Preparing run...');
  console.debug('[main] Lane selected', lane, '-> pre-open');
  setState('pre-open');
}

ui.onLaneSelect = lane => { if (state === 'await-choice') selectLane(lane); };

ui.onStart = () => {
  console.debug('[main] Start clicked');
  game = new Game();
  ui.updateStatus({ prizePence: game.prizePence, checkpoint: 0 });
  beginDoorsPhase();
};

function beginDoorsPhase() {
  if (!game) return;
  if (game.isOver()) { finishGame(); return; }
  const lane = game.startSegment();
  console.debug('[main] New segment, obstacle lane(s) pending', game.pendingObstacleLanes || lane);
  applyDifficultyRamp();
  // Always create a fresh active set so preview doors never appear to jump forward.
  if (preSpawnDoors) clearPreSpawnDoors();
  createDoors();
  assignObstacle();
  // Pre-spawn obstacle hidden to avoid pop-in
  const lanesForObstacle = game.pendingObstacleLanes || [game.pendingObstacleLane];
  preSpawnObstacleMesh(lanesForObstacle);
  // Delay coin spawn until run actually begins to avoid desync while doors translate world
  removeCoins();
  chosen = false;
  choiceResolved = false;
  setState('await-choice');
  ui.showControls('Pick a door (single click)');
  highlightDoor(playerLane);
  // Reset door Z tracker
  lastDoorZ = doorBaseZ;
}

function finishGame() {
  console.debug('[main] Game finished');
  ui.showEnd();
  ui.showSummary(game);
  setState('ended');
}

function resolveRun() {
  if (choiceResolved) return;
  choiceResolved = true;
  const result = game.resolveChoice(playerLane);
  if (!result) return;
  ui.logResult(result);
  if (result.safe) {
    ui.updateStatus({ prizePence: game.prizePence, checkpoint: game.currentCheckpoint });
    playerMesh.material.emissive.setHex(0x0a4d29);
    setState('result');
  } else {
    // Failure popup immediately
    playerMesh.material.emissive.setHex(0x4d0a0a);
    if (sounds.fail) { try { sounds.fail.currentTime = 0; sounds.fail.play(); } catch(e){} }
    finishGame();
  }
}

function proceedAfterResult() {
  playerMesh.material.emissive.setHex(0x082e5a);
  removeObstacleMesh();
  removeCoins();
  clearDoors();
  beginDoorsPhase();
}

function updatePreOpen(dt) {
  if (state !== 'pre-open') return;
  if (stateTime >= revealDelay) {
    setState('doors-opening');
  }
}

function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }
function easeInOutQuad(x){ return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x+2,2)/2; }

function updateDoorsOpening(dt) {
  if (state !== 'doors-opening') return;
  const raw = Math.min(stateTime / doorOpenDuration, 1);
  const t = easeOutCubic(raw);
  const travelProgress = Math.min(stateTime / totalDoorTravelDuration, 1);
  doors.forEach(d => {
    let angle = 0;
    if (d.lane === 0) angle = t * Math.PI * 0.85;
    else if (d.lane === 2) angle = -t * Math.PI * 0.85;
    else angle = t * Math.PI * 0.65 * (d.obstacle ? -1 : 1);
    if (d.hinge) d.hinge.rotation.y = angle; else d.panel.rotation.y = angle;
    const z = d.baseZ + (doorTargetZ - d.baseZ) * travelProgress;
    d.frame.position.z = z;
    if (d.hinge) d.hinge.position.z = z + 0.11;
  });
  if (raw === 0) { if (sounds.door) { try { sounds.door.currentTime = 0; sounds.door.play(); } catch(e){} } }
  if (raw >= 1) setState('doors-sliding');
  // Use first door frame Z as reference
  if (doors.length) {
    const refZ = doors[0].frame.position.z;
    if (lastDoorZ == null) lastDoorZ = refZ;
    const dz = refZ - lastDoorZ;
    if (Math.abs(dz) > 1e-5) trackGroup.position.z += dz; // move world with doors
    lastDoorZ = refZ;
  }
}

function updateDoorsSliding(dt) {
  if (state !== 'doors-sliding') return;
  const raw = Math.min(stateTime / doorSlideDuration, 1);
  const t = easeInOutQuad(raw);
  const travelProgress = Math.min((doorOpenDuration + stateTime) / totalDoorTravelDuration, 1);
  doors.forEach(d => {
    const z = d.baseZ + (doorTargetZ - d.baseZ) * travelProgress;
    d.frame.position.set(laneX[d.lane], 2, z);
    if (d.hinge) {
      const hingeOffset = (d.lane === 0) ? -0.8 : (d.lane === 2 ? 0.8 : -0.8);
      d.hinge.position.set(laneX[d.lane] + hingeOffset, 2, z + 0.11);
      d.panel.material.opacity = 1 - t * 0.2;
      d.panel.material.transparent = true;
    }
  });
  const arrived = doors.length && doors.every(d => d.frame.position.z <= doorTargetZ + 0.01);
  if (arrived) {
    // Clone current closed doors for upcoming preview before removing originals
    cloneDoorsForPreview();
    clearDoors();
    if (preSpawnObstacle) { preSpawnObstacle.visible = true; obstacleMesh = preSpawnObstacle; preSpawnObstacle = null; }
    // Spawn coins now that world (trackGroup) will no longer shift with doors
    spawnCoins();
    setState('running');
  }
  if (doors.length) {
    const refZ = doors[0].frame.position.z;
    if (lastDoorZ == null) lastDoorZ = refZ;
    const dz = refZ - lastDoorZ;
    if (Math.abs(dz) > 1e-5) trackGroup.position.z += dz;
    lastDoorZ = refZ;
  }
}

function updateRunning(dt) {
  if (state !== 'running') return;
  let t = stateTime / runDuration;
  if (obstacleMesh) {
    if (t <= 1) {
      // Approach phase
      obstacleMesh.position.z = obstacleStartZ + (obstacleEndZ - obstacleStartZ) * Math.min(t,1);
      // Early collision: front face (center + half depth ~0.5) crosses player Z
      const lanes = game.pendingObstacleLanes || [game.pendingObstacleLane];
      const frontZ = obstacleMesh.position.z + 0.5;
      if (frontZ >= obstacleEndZ) {
        const hit = lanes.includes(playerLane);
        if (hit) { passDuration = 0; resolveRun(); return; }
      }
    } else {
      // Pass-through after reaching player (safe case only)
      const passT = (stateTime - runDuration) / passDuration; // 0..1
      obstacleMesh.position.z = obstacleEndZ + (obstaclePastZ - obstacleEndZ) * Math.min(passT,1);
      if (passT >= 1) resolveRun();
    }
  }
  // Preview doors (cloned earlier) move forward as a slow anticipation while obstacle approaches
  // Move pre-spawn doors forward in sync with obstacle progress
  if (preSpawnDoors) {
    const moveT = Math.min(t,1);
    preSpawnDoors.forEach(d => {
      const z = preSpawnStartZ + (doorBaseZ - preSpawnStartZ) * moveT;
      d.frame.position.z = z;
      if (d.hinge) d.hinge.position.z = z + 0.11;
    });
  }
  // Coins
  if (coins.length) {
    const approachT = Math.min(stateTime / runDuration, 1); // 0..1 while obstacle approaches
    for (const c of coins) {
      if (c.taken) continue;
      let zPos;
      if (stateTime <= runDuration) {
        // Each coin offset shifts its relative starting point but all share exact curve
        const tCoin = Math.min(Math.max(approachT - (1 - c.offset)*0.05, 0) / (1 - (1 - c.offset)*0.05), 1);
        const worldZ = obstacleStartZ + (obstacleEndZ - obstacleStartZ) * tCoin;
        zPos = worldZ - trackGroup.position.z; // convert to local space
      } else {
        const passT = Math.min((stateTime - runDuration) / passDuration, 1);
        const worldZ = obstacleEndZ + (obstaclePastZ - obstacleEndZ) * passT;
        zPos = worldZ - trackGroup.position.z;
      }
      c.mesh.position.z = zPos;
      const coinWorldZ = c.mesh.position.z + trackGroup.position.z;
      if (c.lane === playerLane && Math.abs(coinWorldZ - obstacleEndZ) < 0.5) {
        c.taken = true;
        coinGroup.remove(c.mesh);
        game.prizePence += game.config.coinPrizePence;
        ui.updateStatus({ prizePence: game.prizePence, checkpoint: game.currentCheckpoint });
        spawnFloatingText('+£0.10');
        spawnCoinSparkle(c.mesh.position.x, c.mesh.position.y, obstacleEndZ);
        if (sounds.pickup) { try { sounds.pickup.currentTime = 0; sounds.pickup.play(); } catch(e){} }
      }
      c.mesh.rotation.z += dt * 6;
    }
  }
}

// Clone current active doors to create preview copies far ahead for the next checkpoint
function cloneDoorsForPreview() {
  if (!doors.length) return;
  // Distance to travel matches obstacle approach distance so they arrive near doorBaseZ as run ends
  const travelDist = obstacleEndZ - obstacleStartZ;
  preSpawnStartZ = doorBaseZ - travelDist;
  preSpawnDoors = [];
  preSpawnCreated = true;
  for (const src of doors) {
    const frameClone = new THREE.Group();
    // Rebuild frame (clone() on group would also work, but rebuild keeps materials consistent and explicit)
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x444c55 });
    const innerWidth = 1.8, innerHeight = 3.6, thickness = 0.18, depth = 0.3;
    const top = new THREE.Mesh(new THREE.BoxGeometry(innerWidth + thickness*2, thickness, depth), beamMat); top.position.set(0, innerHeight/2, 0); frameClone.add(top);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(innerWidth + thickness*2, thickness, depth), beamMat); bottom.position.set(0, -innerHeight/2, 0); frameClone.add(bottom);
    const left = new THREE.Mesh(new THREE.BoxGeometry(thickness, innerHeight, depth), beamMat); left.position.set(-(innerWidth/2 + thickness/2),0,0); frameClone.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(thickness, innerHeight, depth), beamMat); right.position.set(innerWidth/2 + thickness/2,0,0); frameClone.add(right);
    frameClone.position.set(laneX[src.lane], 2, preSpawnStartZ);
    scene.add(frameClone);
    const hinge = new THREE.Object3D();
    const hingeOffset = (src.lane === 0) ? -0.8 : (src.lane === 2 ? 0.8 : -0.8);
    hinge.position.set(laneX[src.lane] + hingeOffset, 2, preSpawnStartZ + 0.11);
    scene.add(hinge);
    const panelGeo = new THREE.BoxGeometry(1.6,3.2,0.12);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x6d747c });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    if (src.lane===0) panel.position.x = 0.8; else if (src.lane===2) panel.position.x = -0.8; else panel.position.x = 0.8;
    hinge.add(panel);
    preSpawnDoors.push({ frame: frameClone, panel, hinge, lane: src.lane, obstacle:false, baseZ: preSpawnStartZ });
  }
}

function spawnFloatingText(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,215,0,1)';
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width/2, canvas.height/2);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(playerMesh.position.x, 2.2, playerMesh.position.z - 0.5);
  sprite.scale.set(2, 1, 1);
  scene.add(sprite);
  floatingTexts.push({ mesh: sprite, t: 0, duration: 1.2 });
}

function spawnCoinSparkle(x,y,z) {
  const group = new THREE.Group();
  const count = 12;
  for (let i=0;i<count;i++) {
    const geo = new THREE.SphereGeometry(0.07, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xfff2a6, emissive: 0xdeb947 });
    const p = new THREE.Mesh(geo, mat);
    const angle = (i / count) * Math.PI * 2;
    const radius = 0.1 + Math.random()*0.15;
    p.position.set(x + Math.cos(angle)*radius, y + Math.random()*0.3, z + Math.sin(angle)*radius);
    group.add(p);
  }
  scene.add(group);
  particles.push({ mesh: group, t: 0, duration: 0.8 });
}

function updateFloating(dt) {
  if (floatingTexts.length===0 && particles.length===0) return;
  for (const ft of floatingTexts) {
    ft.t += dt;
    const k = ft.t / ft.duration;
    ft.mesh.position.y += dt * 0.8;
    ft.mesh.material.opacity = 1 - k;
  }
  floatingTexts = floatingTexts.filter(f => {
    if (f.t >= f.duration) { scene.remove(f.mesh); return false; }
    return true;
  });
  for (const p of particles) {
    p.t += dt;
    const k = p.t / p.duration;
    p.mesh.children.forEach((c,i) => {
      c.position.x *= 1 + dt * 1.2; // radial expansion
      c.position.y += dt * 1.2;
      c.material.opacity = 1 - k;
      c.material.transparent = true;
      c.scale.multiplyScalar(1 - dt*0.2);
    });
  }
  particles = particles.filter(p => { if (p.t >= p.duration) { scene.remove(p.mesh); return false; } return true; });
}

// Difficulty ramp: shrink timings and increase coin density progressively
function applyDifficultyRamp() {
  if (!game) return;
  const progress = Math.min(game.currentCheckpoint / game.config.maxCheckpoints, 1);
  // Reduce runDuration by up to 40%, door timings by 30%
  runDuration = 3.5 * (1 - 0.4 * progress);
  doorOpenDuration = 0.9 * (1 - 0.3 * progress);
  doorSlideDuration = 0.6 * (1 - 0.3 * progress);
  totalDoorTravelDuration = doorOpenDuration + doorSlideDuration;
  // Increase potential coin count indirectly by spawning extra coins based on progress (handled in spawn routine)
}

function updateResult(dt) {
  if (state !== 'result') return;
  if (stateTime >= resultPause) {
    proceedAfterResult();
  }
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  // Fallback in case lastTs was ever reset/undefined
  if (lastTs === undefined || lastTs === null) lastTs = now;
  let dt = (now - lastTs) / 1000;
  // Guard against tab suspend or long pauses creating huge dt spikes
  if (dt > 0.5) dt = 0.5;
  lastTs = now;
  stateTime += dt;

  if (state !== 'ended') {
    switch (state) {
      case 'pre-open': updatePreOpen(dt); break;
      case 'doors-opening': updateDoorsOpening(dt); break;
      case 'doors-sliding': updateDoorsSliding(dt); break;
      case 'running': updateRunning(dt); break;
      case 'result': updateResult(dt); break;
    }
  }

  // Floating texts & particles
  updateFloating(dt);

  // Sweets environment scroll only during active run phase (after doors gone and player is moving)
  if (state === 'running') updateSweets(dt);

  // Lane tween update
  if (laneTween && playerMesh) {
    laneTween.t += dt;
    const k = Math.min(laneTween.t / laneTween.duration, 1);
    // ease in-out
    const eased = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k+2,2)/2;
    playerMesh.position.x = laneTween.from + (laneTween.to - laneTween.from) * eased;
    if (k >= 1) laneTween = null;
  }

  renderer.render(scene, camera);
}

initThree();
animate();
