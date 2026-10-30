import './style.css';
import { PortalScene, type WorldName } from './scene';
import { clamp, faceToEye, type FaceSample } from './projection';
import type { HeadTracker } from './head-tracker';
import { gazeFeatures, predictGaze, OneEuroFilter, type GazeModel, type GazePoint, type TrackingSample } from './gaze';
import { GazeCalibration } from './calibration';

const icons = {
  window: '<rect x="4" y="3" width="12" height="15"/><rect x="9" y="8" width="12" height="15"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  external: '<path d="M6 18 18 6M6 6h12v12"/>',
  camera: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 9 5-3v12l-5-3"/>',
  pointer: '<path d="m5 3 14 9-7 1-3 7z"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
const icon = (name: keyof typeof icons, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="BEYOND 首页">${icon('window')}<span>BEYOND<span class="brand-dot">®</span></span></a>
      <span class="brand-caption">屏幕之外<span>AN EXPERIMENT IN PERSPECTIVE</span></span>
      <button class="about-button" id="about-button">关于实验 ${icon('external')}</button>
    </header>

    <main>
      <section class="intro" aria-labelledby="page-title">
        <div>
          <p class="eyebrow"><span class="tiny-cross">+</span> INTERACTIVE SPACE <span class="eyebrow-separator">/</span> 实验 001</p>
          <h1 id="page-title">屏幕是一扇窗<span class="title-period">。</span></h1>
          <p class="intro-description">移动你的头，看看边界之外。</p>
        </div>
        <div class="intro-note"><span class="note-line"></span><p>空间一直都在。<br>只是，换个角度才能看见。</p></div>
      </section>

      <section class="experience" aria-label="交互式三维空间">
        <div class="portal" id="portal" tabindex="0" aria-label="三维空间，移动鼠标或使用方向键探索，R 复位，F 全屏">
          <div class="portal-vignette"></div>
          <div class="portal-top">
            <div class="world-meta"><span class="live-dot"></span><span id="world-title">悬浮之间</span><span class="world-divider">/</span><span id="world-number">SPACE 01</span></div>
            <div class="render-meta"><span id="fps">60</span> FPS <span class="render-divider">·</span> LIVE RENDER</div>
          </div>
          <div class="corner corner-tl"></div><div class="corner corner-tr"></div><div class="corner corner-bl"></div><div class="corner corner-br"></div>
          <div class="axis-widget" aria-hidden="true"><span class="axis-y"></span><span class="axis-x"></span><span class="axis-z"></span><i>Y</i><b>X</b><em>Z</em></div>
          <div class="portal-hint" id="portal-hint">${icon('pointer')}<span>移动鼠标，窥见另一面</span><span class="hint-arrows">↔</span></div>
          <div class="portal-bottom">
            <div class="world-switch" role="group" aria-label="选择空间">
              <button class="world-button active" data-world="gallery" aria-pressed="true"><span class="scene-dot gallery-dot"></span>悬浮之间</button>
              <button class="world-button" data-world="cosmos" aria-pressed="false"><span class="scene-dot cosmos-dot"></span>寂静轨道</button>
            </div>
            <div class="portal-tools"><button class="icon-button" id="reset-button" title="视角复位 (R)" aria-label="视角复位">${icon('reset')}</button><button class="icon-button" id="fullscreen-button" title="全屏体验 (F)" aria-label="全屏体验">${icon('expand')}</button></div>
          </div>
          <div class="fatal-error" id="fatal-error" hidden><span>这个窗口暂时无法打开</span><p>浏览器未能创建 3D 画布。请打开硬件加速，或换一个支持 WebGL 的浏览器。</p></div>
        </div>

        <div class="controls">
          <div class="mode-section">
            <span class="control-label">探索方式</span>
            <div class="mode-switch" role="group" aria-label="探索方式">
              <button id="pointer-button" class="mode-button active" aria-pressed="true">${icon('pointer')}鼠标预览</button>
              <button id="head-button" class="mode-button" aria-pressed="false">${icon('camera')}头部追踪</button>
            </div>
          </div>
          <div class="sensitivity-section"><label class="control-label" for="sensitivity">视差强度</label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="1" aria-valuetext="1.0 倍"/><output id="sensitivity-value" for="sensitivity">1.0×</output></div>
          <button id="calibrate-button" class="calibrate-button" disabled>${icon('target')}校准中心</button>
          <button id="camera-button" class="camera-button">${icon('camera')}<span>开启摄像头</span>${icon('arrow')}</button>
        </div>
        <div class="experience-status">
          <p class="status-message" id="status-message" role="status"><span class="status-dot"></span><span id="status-text">鼠标预览已就绪 · 将指针移入空间</span></p>
          <span class="privacy-note">${icon('shield')}影像仅在本机处理，不录制、不上传</span>
        </div>
        <div class="gaze-controls"><span class="focus-lock">${icon('target')}定焦 · 前后缩放已锁定</span><button id="gaze-calibrate-button" class="gaze-calibrate-button" disabled>${icon('target')}九点视线校准</button><label class="gaze-toggle"><input id="show-gaze" type="checkbox" checked/>显示估计落点 / 射线</label></div>
        <div class="tracking-diagnostics" id="tracking-diagnostics" hidden><span id="landmark-metric">等待特征点</span><span id="gaze-metric">视线尚未校准</span><span id="ray-metric">虚拟射线：—</span><span id="fit-metric">先校准，再检查估计落点</span></div>
      </section>

      <section class="field-notes" aria-label="体验指南">
        <div class="field-note"><span class="step-number">01</span><div><h2>给空间一个新视角</h2><p>左右或上下移动，发现边框后藏着的物体。</p></div></div>
        <div class="field-note"><span class="step-number">02</span><div><h2>让身体成为控制器</h2><p>开启摄像头，坐在正前方，让视角跟随你的头。</p></div></div>
        <div class="field-note"><span class="step-number">03</span><div><h2>让视线穿过屏幕</h2><p>完成九点校准，查看估计的视线落点和空间射线。</p></div></div>
      </section>
    </main>
    <footer><span>A SMALL WINDOW. ANOTHER WORLD.</span><span>用好奇心，打破第四面墙 <span class="footer-cross">↗</span></span></footer>
  </div>
  <div class="camera-preview" id="camera-preview" hidden><video id="tracking-video" muted playsinline></video><canvas id="landmarks-overlay" width="640" height="480"></canvas><div class="camera-crosshair"></div><span id="tracking-label">正在寻找你</span><button id="close-camera" aria-label="关闭摄像头">${icon('close')}</button></div>
  <div id="gaze-cursor" class="gaze-cursor" hidden aria-hidden="true"><span>估计视线</span></div>
  <dialog id="about-dialog" aria-labelledby="about-title"><div class="dialog-content"><button class="dialog-close" id="close-about" aria-label="关闭">${icon('close')}</button><p class="eyebrow">BEYOND THE FRAME</p><h2 id="about-title">一块屏幕，<br>一个新的空间。</h2><p>想象显示器是一扇真实的窗户。你的头移向一侧，就能看见原本被窗框遮住的地方。</p><p>头部平移改变窗后的透视，虚拟焦距和观看距离固定，前后移动不再缩放。完成九点校准后，虹膜与面部姿态用于估计你在页面上的注视位置，再把它变成穿过屏幕、射入虚拟空间的射线。</p><div class="dialog-tip">${icon('target')}先点击「校准中心」，再完成「九点视线校准」。保持头部相对稳定，只用眼睛注视圆点。绿色圆点为估计落点；普通摄像头无法保证逐像素准确。窗口尺寸或坐姿明显改变后，请重新校准。</div><div class="keyboard-shortcuts"><span><kbd>R</kbd>复位</span><span><kbd>F</kbd>全屏</span><span><kbd>↑ ↓ ← →</kbd>探索</span></div><p class="dialog-privacy">${icon('shield')}视频和个人校准数据只在本机处理，关闭摄像头后清除。</p></div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const portal = $('portal');
let scene: PortalScene | undefined;
let tracker: HeadTracker | undefined;
let mode: 'pointer' | 'head' = 'pointer';
let cameraState: 'off' | 'starting' | 'on' = 'off';
let sensitivity = 1;
let center: FaceSample | null = null;
let latestFace: TrackingSample | null = null;
let lastFaceAt = 0;
let calibratedAutomatically = false;
let cameraGeneration = 0;
let pointer = { x: 0, y: 0 };
let gazeModel: GazeModel | null = null;
let gazePoint: GazePoint | null = null;
let lastDiagnosticsAt = 0;
const headFilterX = new OneEuroFilter(3, 0.7), headFilterY = new OneEuroFilter(3, 0.7);
const gazeFilterX = new OneEuroFilter(1.6, 0.5), gazeFilterY = new OneEuroFilter(1.6, 0.5);
const calibration = new GazeCalibration(model => {
  gazeModel = model;
  gazeFilterX.reset(); gazeFilterY.reset();
  $('fit-metric').textContent = `校准拟合误差 ${Math.round(model.fitError)} 页面px（非实际精度）`;
  $('gaze-calibrate-button').innerHTML = `${icon('target')}重新校准视线`;
  status('九点视线校准完成 · 绿色圆点是估计落点，头部移动控制窗口视差');
}, () => { $('gaze-cursor').hidden = true; });

function status(message: string, state: 'ready' | 'warning' | 'error' = 'ready') {
  if ($('status-text').textContent !== message) $('status-text').textContent = message;
  $('status-message').dataset.state = state;
}

try {
  scene = new PortalScene(portal);
  scene.onFrame = (_eye, fps) => { $('fps').textContent = String(Math.min(fps, 144)); };
  scene.onRay = (ray, hitDistance) => {
    if (!ray) { $('ray-metric').textContent = '虚拟射线：—'; return; }
    const n = ray.direction;
    $('ray-metric').textContent = `射线方向 (${n.x.toFixed(3)}, ${n.y.toFixed(3)}, ${n.z.toFixed(3)})${hitDistance ? ` · 命中 ${hitDistance.toFixed(1)}` : ''}`;
  };
  scene.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopCamera();
    $('fatal-error').hidden = false;
    status('3D 画布连接中断，请刷新页面。', 'error');
  });
} catch {
  $('fatal-error').hidden = false;
  status('此浏览器未能启动 WebGL。', 'error');
  ['pointer-button', 'head-button', 'camera-button', 'reset-button', 'fullscreen-button'].forEach(id => { ($<HTMLButtonElement>(id)).disabled = true; });
}

function updatePointer() {
  if (mode !== 'pointer' || !scene) return;
  Object.assign(scene.target, { x: pointer.x * 3.6 * sensitivity, y: pointer.y * 2.3 * sensitivity, z: 6 });
}

portal.addEventListener('pointermove', event => {
  if (mode !== 'pointer') return;
  const rect = portal.getBoundingClientRect();
  pointer = { x: clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1), y: clamp(1 - (event.clientY - rect.top) / rect.height * 2, -1, 1) };
  updatePointer();
  $('portal-hint').classList.add('has-interacted');
});
portal.addEventListener('pointerleave', () => { pointer = { x: 0, y: 0 }; updatePointer(); });
portal.addEventListener('pointerdown', event => { if ((event.target as HTMLElement).tagName === 'CANVAS') portal.focus({ preventScroll: true }); });

function setMode(next: 'pointer' | 'head') {
  mode = next;
  for (const [id, selected] of [['pointer-button', next === 'pointer'], ['head-button', next === 'head']] as const) {
    $(id).classList.toggle('active', selected);
    $(id).setAttribute('aria-pressed', String(selected));
  }
  $<HTMLButtonElement>('calibrate-button').disabled = next !== 'head' || cameraState !== 'on' || !latestFace;
  $('portal-hint').innerHTML = next === 'head' ? `${icon('camera')}<span>缓缓移动头部，探索边界之外</span><span class="hint-arrows">↔</span>` : `${icon('pointer')}<span>移动鼠标，窥见另一面</span><span class="hint-arrows">↔</span>`;
  $('portal-hint').classList.remove('has-interacted');
  if (next === 'pointer') { scene?.reset(); status('鼠标预览已就绪 · 将指针移入空间'); }
}

function updateGazeRay() {
  const enabled = $<HTMLInputElement>('show-gaze').checked && mode === 'head' && !calibration.open;
  const visible = enabled && gazePoint && gazePoint.u >= 0 && gazePoint.u <= 1 && gazePoint.v >= 0 && gazePoint.v <= 1;
  $('gaze-cursor').hidden = !visible;
  if (!visible || !gazePoint) { scene?.setGaze(null); return; }
  const x = gazePoint.u * window.innerWidth, y = gazePoint.v * window.innerHeight;
  $('gaze-cursor').style.left = `${x}px`; $('gaze-cursor').style.top = `${y}px`;
  const rect = portal.getBoundingClientRect();
  const u = (x - rect.left - portal.clientLeft) / portal.clientWidth;
  const v = (y - rect.top - portal.clientTop) / portal.clientHeight;
  scene?.setGaze(u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null);
}

function drawLandmarks(face: TrackingSample) {
  const video = $<HTMLVideoElement>('tracking-video');
  const canvas = $<HTMLCanvasElement>('landmarks-overlay');
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480; }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#d9e9ab77';
  for (const point of face.landmarks) { ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, 1, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = face.eyes?.valid ? '#dfff82' : '#e6b384'; ctx.lineWidth = 2;
  for (const indices of [[33, 160, 159, 158, 133, 153, 145, 144, 33], [362, 385, 386, 387, 263, 373, 374, 380, 362], [469, 470, 471, 472, 469], [474, 475, 476, 477, 474]]) {
    ctx.beginPath();
    indices.forEach((index, i) => { const point = face.landmarks[index]; if (!point) return; if (i === 0) ctx.moveTo(point.x * canvas.width, point.y * canvas.height); else ctx.lineTo(point.x * canvas.width, point.y * canvas.height); });
    ctx.stroke();
  }
}

function sample(face: TrackingSample | null) {
  const now = performance.now();
  calibration.feed(face, now);
  latestFace = face;
  $<HTMLButtonElement>('calibrate-button').disabled = !face || mode !== 'head';
  $<HTMLButtonElement>('gaze-calibrate-button').disabled = cameraState !== 'on' || !face?.eyes;
  if (!face) {
    gazePoint = null; updateGazeRay();
    const overlay = $<HTMLCanvasElement>('landmarks-overlay');
    overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    $('gaze-metric').textContent = '未检测到人脸，暂停视线';
    if (performance.now() - lastFaceAt > 700) {
      $('tracking-label').textContent = '未检测到人脸';
      $('camera-preview').dataset.tracking = 'lost';
      if (mode === 'head') { scene?.reset(); status('暂时看不到你 · 请面向摄像头，保持面部完整入镜', 'warning'); }
    }
    return;
  }
  lastFaceAt = performance.now();
  $('camera-preview').dataset.tracking = 'active';
  $('tracking-label').textContent = face.eyes?.valid ? '虹膜 + 面部姿态 · 定焦' : '双眼暂不可用 · 视线暂停';
  drawLandmarks(face);
  if (!center) { center = { x: face.x, y: face.y, span: face.span }; calibratedAutomatically = true; }
  const features = gazeFeatures(face);
  if (gazeModel && features && !calibration.open) {
    const point = predictGaze(gazeModel, features);
    gazePoint = { u: gazeFilterX.filter(point.u, now), v: gazeFilterY.filter(point.v, now) };
  } else gazePoint = null;
  updateGazeRay();
  if (now - lastDiagnosticsAt > 200) {
    const degrees = (value: number) => Math.round(value * 180 / Math.PI);
    $('landmark-metric').textContent = `${face.landmarks.length} 点 · 头部 yaw ${degrees(face.pose.yaw)}° / pitch ${degrees(face.pose.pitch)}° · Z 6.00`;
    $('gaze-metric').textContent = gazePoint ? `估计落点 (${Math.round(gazePoint.u * window.innerWidth)}, ${Math.round(gazePoint.v * window.innerHeight)}) 页面px` : !gazeModel ? '视线尚未校准' : '眨眼 / 虹膜不可用，暂停视线';
    lastDiagnosticsAt = now;
  }
  if (mode === 'head') {
    const eye = faceToEye(face, center, sensitivity);
    if (scene) Object.assign(scene.target, { x: headFilterX.filter(eye.x, now), y: headFilterY.filter(eye.y, now), z: 6 });
    if (!calibration.open) status(gazeModel ? '定焦追踪中 · 头部平移控制视差，绿色圆点显示估计视线' : calibratedAutomatically ? '定焦追踪中 · 可校准中心，或进行九点视线校准' : '定焦追踪中 · 左右、上下移动，前后不再缩放');
  }
}

function cameraError(error: unknown) {
  stopCamera(false);
  const name = error instanceof Error ? error.name : '';
  let message = '摄像头或追踪模型启动失败，请重试；仍可用鼠标探索。';
  if (name === 'NotAllowedError' || name === 'SecurityError') message = '摄像头未获授权 · 在浏览器地址栏允许访问后重试';
  else if (name === 'NotFoundError') message = '没有找到摄像头 · 连接摄像头后重试，或继续使用鼠标';
  else if (name === 'NotReadableError') message = '摄像头暂时无法使用 · 请检查是否被其他应用占用';
  else if (error instanceof Error && error.message.includes('HTTPS')) message = error.message;
  status(message, 'error');
}

async function startCamera() {
  if (cameraState !== 'off' || !scene) return;
  const generation = ++cameraGeneration;
  cameraState = 'starting';
  $('camera-button').innerHTML = '<span class="loading-spinner"></span><span>取消开启</span>';
  $('camera-button').classList.add('loading');
  status('请允许摄像头访问 · 首次启动需要加载本地追踪模型');
  try {
    const { HeadTracker } = await import('./head-tracker');
    if (generation !== cameraGeneration) return;
    tracker = new HeadTracker($<HTMLVideoElement>('tracking-video'), sample, cameraError);
    const started = await tracker.start();
    if (!started || generation !== cameraGeneration) return;
    cameraState = 'on';
    $('camera-preview').hidden = false;
    $('tracking-diagnostics').hidden = false;
    $('camera-button').classList.remove('loading');
    $('camera-button').classList.add('camera-on');
    $('camera-button').innerHTML = `${icon('camera')}<span>关闭摄像头</span><span class="camera-on-dot"></span>`;
    setMode('head');
    status('正在寻找你 · 请看向屏幕中央');
  } catch (error) { if (generation === cameraGeneration) cameraError(error); }
}

function stopCamera(updateStatus = true) {
  cameraGeneration++;
  tracker?.stop();
  tracker = undefined;
  cameraState = 'off';
  center = latestFace = null;
  gazeModel = null; gazePoint = null;
  calibration.close();
  headFilterX.reset(); headFilterY.reset(); gazeFilterX.reset(); gazeFilterY.reset();
  $('gaze-cursor').hidden = true; scene?.setGaze(null);
  $<HTMLButtonElement>('gaze-calibrate-button').disabled = true;
  $('gaze-calibrate-button').innerHTML = `${icon('target')}九点视线校准`;
  $('tracking-diagnostics').hidden = true;
  $('fit-metric').textContent = '先校准，再检查估计落点';
  calibratedAutomatically = false;
  $('camera-preview').hidden = true;
  $('camera-button').classList.remove('loading', 'camera-on');
  $('camera-button').innerHTML = `${icon('camera')}<span>开启摄像头</span>${icon('arrow')}`;
  setMode('pointer');
  if (updateStatus) status('摄像头已关闭 · 可继续使用鼠标探索');
}

function calibrate() {
  if (mode === 'head' && latestFace) {
    center = { x: latestFace.x, y: latestFace.y, span: latestFace.span };
    headFilterX.reset(); headFilterY.reset();
    calibratedAutomatically = false;
    scene?.reset();
    status('中心已校准 · 现在可以自然移动头部了');
  } else {
    pointer = { x: 0, y: 0 };
    scene?.reset();
    status('视角已复位');
  }
}

$('camera-button').addEventListener('click', () => cameraState === 'off' ? void startCamera() : stopCamera());
$('head-button').addEventListener('click', () => cameraState === 'on' ? setMode('head') : void startCamera());
$('pointer-button').addEventListener('click', () => { if (cameraState !== 'off') stopCamera(); else setMode('pointer'); });
$('close-camera').addEventListener('click', () => stopCamera());
$('calibrate-button').addEventListener('click', calibrate);
$('reset-button').addEventListener('click', calibrate);
$('gaze-calibrate-button').addEventListener('click', () => {
  if (cameraState !== 'on') return;
  $('gaze-cursor').hidden = true; scene?.setGaze(null);
  calibration.show();
});
$('show-gaze').addEventListener('change', updateGazeRay);
window.addEventListener('scroll', updateGazeRay, { passive: true });
window.addEventListener('resize', () => {
  if (gazeModel && (gazeModel.width !== window.innerWidth || gazeModel.height !== window.innerHeight)) {
    gazeModel = null; gazePoint = null; updateGazeRay();
    $('fit-metric').textContent = '窗口尺寸已改变，请重新进行九点视线校准';
    status('窗口尺寸已改变 · 视线需要重新校准，头部视差仍可使用', 'warning');
  }
  calibration.close();
});
$<HTMLInputElement>('sensitivity').addEventListener('input', event => {
  sensitivity = Number((event.target as HTMLInputElement).value);
  $('sensitivity-value').textContent = `${sensitivity.toFixed(1)}×`;
  $('sensitivity').setAttribute('aria-valuetext', `${sensitivity.toFixed(1)} 倍`);
  updatePointer();
  if (mode === 'head' && latestFace && center && scene) Object.assign(scene.target, faceToEye(latestFace, center, sensitivity));
});

document.querySelectorAll<HTMLButtonElement>('.world-button').forEach(button => {
  button.addEventListener('click', () => {
    const world = button.dataset.world as WorldName;
    scene?.setWorld(world);
    $('world-title').textContent = world === 'gallery' ? '悬浮之间' : '寂静轨道';
    $('world-number').textContent = world === 'gallery' ? 'SPACE 01' : 'SPACE 02';
    document.querySelectorAll('.world-button').forEach(other => { other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button)); });
  });
});

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await portal.requestFullscreen();
  } catch { status('当前浏览器不支持全屏，请在新标签页中打开。', 'warning'); }
}
$('fullscreen-button').addEventListener('click', () => void fullscreen());
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  $('fullscreen-button').setAttribute('aria-label', active ? '退出全屏' : '全屏体验');
});
const dialog = $<HTMLDialogElement>('about-dialog');
$('about-button').addEventListener('click', () => dialog.showModal());
$('close-about').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.addEventListener('keydown', event => {
  if (dialog.open || calibration.open || event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 'r') calibrate();
  if (event.key.toLowerCase() === 'f') void fullscreen();
  if (mode !== 'pointer' || document.activeElement !== portal) return;
  const steps: Record<string, [number, number]> = { ArrowLeft: [-0.18, 0], ArrowRight: [0.18, 0], ArrowUp: [0, 0.18], ArrowDown: [0, -0.18] };
  const step = steps[event.key];
  if (step) { event.preventDefault(); pointer = { x: clamp(pointer.x + step[0], -1, 1), y: clamp(pointer.y + step[1], -1, 1) }; updatePointer(); }
});
window.addEventListener('pagehide', () => { tracker?.stop(); scene?.dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
