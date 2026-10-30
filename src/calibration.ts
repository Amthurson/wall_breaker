import { fitGazeModel, gazeFeatures, type CalibrationSample, type GazeModel, type TrackingSample } from './gaze';

export class GazeCalibration {
  private dialog: HTMLDialogElement;
  private samples: CalibrationSample[] = [];
  private phase: 'intro' | 'collecting' | 'done' = 'intro';
  private index = 0;
  private phaseStarted = 0;
  private collectedFor = 0;
  private lastSampleTime = 0;
  private pointSamples = 0;
  private readonly points = [[0.5, 0.5], [0.15, 0.15], [0.5, 0.15], [0.85, 0.15], [0.85, 0.5], [0.85, 0.85], [0.5, 0.85], [0.15, 0.85], [0.15, 0.5]];

  constructor(private onModel: (model: GazeModel) => void, private onClose: () => void) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'gaze-calibration';
    this.dialog.setAttribute('aria-labelledby', 'gaze-calibration-title');
    this.dialog.innerHTML = `<button class="gaze-calibration-close" aria-label="取消视线校准">×</button><div class="calibration-intro"><p class="eyebrow">PERSONAL GAZE CALIBRATION</p><h2 id="gaze-calibration-title">让视线，对准这个窗口。</h2><p>接下来会依次出现 9 个圆点。保持坐姿和头部相对稳定，<br>只用眼睛看着每一个点，不需要点击。</p><p class="calibration-explanation">每个点自动采集约 1 秒。双眼需要清晰入镜，眨眼时会暂停采样。校准结果只对当前窗口尺寸和坐姿有效。</p><p class="calibration-error" role="status"></p><button class="camera-button calibration-begin">开始九点校准 →</button><p class="calibration-disclaimer">这是普通摄像头的视线估计，无法保证逐像素准确。</p></div><div class="calibration-running" hidden><div class="calibration-header"><span>看着圆点，保持头部稳定</span><span class="calibration-step">1 / 9</span></div><div class="calibration-dot" aria-label="请注视此圆点"><span></span></div><p class="calibration-prompt" role="status">正在等待双眼入镜</p></div>`;
    document.body.append(this.dialog);
    this.dialog.querySelector('.gaze-calibration-close')!.addEventListener('click', () => this.close());
    this.dialog.querySelector('.calibration-begin')!.addEventListener('click', () => this.begin());
    this.dialog.addEventListener('close', () => { this.phase = 'intro'; this.onClose(); });
    this.dialog.addEventListener('cancel', () => { this.phase = 'intro'; });
  }

  get open() { return this.dialog.open; }

  show() {
    this.phase = 'intro';
    this.dialog.querySelector<HTMLElement>('.calibration-intro')!.hidden = false;
    this.dialog.querySelector<HTMLElement>('.calibration-running')!.hidden = true;
    this.dialog.querySelector<HTMLElement>('.calibration-error')!.textContent = '';
    this.dialog.showModal();
  }

  private begin() {
    this.samples = [];
    this.index = 0;
    this.phase = 'collecting';
    this.dialog.querySelector<HTMLElement>('.calibration-intro')!.hidden = true;
    this.dialog.querySelector<HTMLElement>('.calibration-running')!.hidden = false;
    this.nextPoint();
  }

  private nextPoint() {
    const [u, v] = this.points[this.index];
    const dot = this.dialog.querySelector<HTMLElement>('.calibration-dot')!;
    dot.style.left = `${u * 100}%`; dot.style.top = `${v * 100}%`;
    dot.style.setProperty('--progress', '0deg');
    this.dialog.querySelector('.calibration-step')!.textContent = `${this.index + 1} / 9`;
    this.phaseStarted = performance.now();
    this.lastSampleTime = 0;
    this.collectedFor = 0;
    this.pointSamples = 0;
  }

  feed(sample: TrackingSample | null, time: number) {
    if (!this.open || this.phase !== 'collecting') return;
    const features = sample ? gazeFeatures(sample) : null;
    const prompt = this.dialog.querySelector<HTMLElement>('.calibration-prompt')!;
    if (!features) {
      prompt.textContent = sample ? '双眼需要睁开并清晰入镜 · 已暂停采样' : '未检测到人脸 · 已暂停采样';
      this.lastSampleTime = 0;
      this.phaseStarted = time;
      return;
    }
    if (time - this.phaseStarted < 500) { prompt.textContent = '看着圆点，等待视线稳定'; return; }
    prompt.textContent = '正在采集，请继续注视';
    const [u, v] = this.points[this.index];
    this.samples.push({ features, u, v });
    this.pointSamples++;
    if (this.lastSampleTime) this.collectedFor += Math.min(time - this.lastSampleTime, 100);
    this.lastSampleTime = time;
    this.dialog.querySelector<HTMLElement>('.calibration-dot')!.style.setProperty('--progress', `${Math.min(this.collectedFor / 950, 1) * 360}deg`);
    if (this.collectedFor < 950 || this.pointSamples < 12) return;
    if (++this.index < this.points.length) { this.nextPoint(); return; }
    try {
      const model = fitGazeModel(this.samples, window.innerWidth, window.innerHeight);
      this.phase = 'done';
      this.onModel(model);
      this.close();
    } catch (error) {
      this.phase = 'intro';
      this.dialog.querySelector<HTMLElement>('.calibration-intro')!.hidden = false;
      this.dialog.querySelector<HTMLElement>('.calibration-running')!.hidden = true;
      this.dialog.querySelector<HTMLElement>('.calibration-error')!.textContent = error instanceof Error ? error.message : '校准未完成，请重试。';
    }
  }

  close() { if (this.dialog.open) this.dialog.close(); }
}
