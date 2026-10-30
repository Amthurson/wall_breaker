import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { extractTrackingSample, type TrackingSample } from './gaze';

export class HeadTracker {
  private landmarker?: FaceLandmarker;
  private stream?: MediaStream;
  private frame = 0;
  private lastVideoTime = -1;
  private lastDetectTime = 0;
  private running = false;
  private generation = 0;

  constructor(
    private video: HTMLVideoElement,
    private onSample: (sample: TrackingSample | null) => void,
    private onError: (error: unknown) => void,
  ) {}

  async start() {
    const generation = ++this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('请在 localhost 或 HTTPS 页面中打开，以使用摄像头。');
    }
    try {
      // Request permission before loading the model; denied permission does no extra work.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      const files = await FilesetResolver.forVisionTasks('/vision');
      if (generation !== this.generation) return false;
      const options = {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' as const },
        runningMode: 'VIDEO' as const,
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      };
      try { this.landmarker = await FaceLandmarker.createFromOptions(files, options); }
      catch { this.landmarker = await FaceLandmarker.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } }); }
      if (generation !== this.generation) { this.landmarker.close(); this.landmarker = undefined; return false; }
      this.running = true;
      this.lastVideoTime = -1;
      this.lastDetectTime = 0;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (this.running) { this.stop(); this.onError(new Error('摄像头连接已断开，请重新开启。')); }
      });
      this.frame = requestAnimationFrame(this.detect);
      return true;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private detect = (time: number) => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.detect);
    if (document.hidden || time - this.lastDetectTime < 40 || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastDetectTime = time;
    this.lastVideoTime = this.video.currentTime;
    try {
      const result = this.landmarker!.detectForVideo(this.video, time);
      const face = result.faceLandmarks[0];
      if (!face) { this.onSample(null); return; }
      this.onSample(extractTrackingSample(face, this.video.videoHeight / this.video.videoWidth, result.facialTransformationMatrixes[0]?.data));
    } catch (error) { this.stop(); this.onError(error); }
  };

  stop() {
    this.generation++;
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = undefined;
  }
}
