import * as THREE from 'three';
import { clamp, screenFrustum, type EyePosition } from './projection';

export type WorldName = 'gallery' | 'cosmos';

export class PortalScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  readonly eye: EyePosition = { x: 0, y: 0, z: 6 };
  readonly target: EyePosition = { x: 0, y: 0, z: 6 };
  private room = new THREE.Group();
  private cosmos = new THREE.Group();
  private sculptures = new THREE.Group();
  private moon!: THREE.Mesh;
  private ring!: THREE.Mesh;
  private stars!: THREE.Points;
  private hiddenLeft = new THREE.Group();
  private hiddenRight = new THREE.Group();
  private hiddenTop!: THREE.Mesh;
  private width = 1;
  private height = 1;
  private halfHeight = 3;
  private frame = 0;
  private lastTime = 0;
  private lastMetric = 0;
  private frameCount = 0;
  private world: WorldName = 'gallery';
  private observer: ResizeObserver;
  onFrame?: (eye: EyePosition, fps: number) => void;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '可通过头部或鼠标移动视角的三维空间');
    this.container.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color('#242923');
    this.scene.fog = new THREE.FogExp2('#242923', 0.019);
    this.scene.add(new THREE.HemisphereLight('#e8efda', '#283028', 2.5));
    const sun = new THREE.DirectionalLight('#fff4da', 4.5);
    sun.position.set(-3, 9, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 50 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.target.position.set(0, -3, -8);
    this.scene.add(sun, sun.target);
    const fill = new THREE.PointLight('#cae6bd', 60, 30, 2);
    fill.position.set(6, 3, -9);
    this.scene.add(fill);
    this.makeRoom();
    this.makeCosmos();
    this.scene.add(this.room, this.sculptures, this.cosmos);
    this.cosmos.visible = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.animate(0);
  }

  private mat(color: string, roughness = 0.7, metalness = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  private box(group: THREE.Group, size: number[], position: number[], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  private label(text: string, x: number, y: number, z: number, width = 2, color = '#bbc6b2') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = '500 74px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 512, 150);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.position.set(x, y, z);
    return mesh;
  }

  private makeRoom() {
    const floor = this.mat('#707969', 0.83);
    const wall = this.mat('#626e5d', 0.9);
    const dark = this.mat('#303d31', 0.8);
    const stone = this.mat('#bcc4ae', 0.78);
    const orange = this.mat('#e47e43', 0.38, 0.13);
    this.box(this.room, [64, 0.25, 40], [0, -3.5, -17], floor);
    this.box(this.room, [64, 18, 0.3], [0, 4.8, -25], wall);
    this.box(this.room, [0.3, 18, 38], [-30, 4.8, -16], wall);
    this.box(this.room, [0.3, 18, 38], [30, 4.8, -16], wall);
    this.box(this.room, [64, 0.2, 40], [0, 12, -17], dark);

    // Thin floor seams and repeated portals make the motion parallax legible.
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#b7c1a7', transparent: true, opacity: 0.18 });
    const points: number[] = [];
    for (let x = -20; x <= 20; x += 2) points.push(x, -3.365, 2, x, -3.365, -35);
    for (let z = 2; z >= -35; z -= 2) points.push(-21, -3.365, z, 21, -3.365, z);
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.room.add(new THREE.LineSegments(grid, lineMaterial));

    for (const z of [-3.5, -11, -19]) {
      this.box(this.room, [0.22, 13, 0.35], [-10.8, 3, z], dark);
      this.box(this.room, [0.22, 13, 0.35], [10.8, 3, z], dark);
      this.box(this.room, [21.8, 0.22, 0.35], [0, 9.4, z], dark);
      const emissive = new THREE.MeshBasicMaterial({ color: '#d9e6b5' });
      this.box(this.room, [0.025, 10, 0.04], [-10.66, 2, z + 0.2], emissive);
      this.box(this.room, [0.025, 10, 0.04], [10.66, 2, z + 0.2], emissive);
    }

    // An oversized circular artwork sits far behind objects near the screen.
    this.box(this.room, [13, 10, 0.15], [0, 2.6, -24.7], dark);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(3.6, 96), this.mat('#cad2ac', 0.8));
    disk.position.set(0, 3.6, -24.58);
    this.room.add(disk);
    this.room.add(this.label('S T I L L   /   S P A C E', 0, -1.35, -24.45, 5.8));

    this.box(this.sculptures, [4.4, 0.35, 4.4], [0.4, -3.13, -9], stone);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.5, 64), stone);
    pedestal.position.set(0.4, -2.2, -9);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.sculptures.add(pedestal);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.46, 32, 128), orange);
    this.ring.position.set(0.4, 0.85, -9);
    this.ring.rotation.set(0.15, -0.35, -0.16);
    this.ring.castShadow = true;
    this.sculptures.add(this.ring);

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.72, 48, 32), this.mat('#d4d9c6', 0.19, 0.6));
    sphere.position.set(0.6, 0.85, -9);
    sphere.castShadow = true;
    this.sculptures.add(sphere);

    this.box(this.sculptures, [2.1, 3.6, 2.1], [-4.5, -1.55, -5.5], dark).rotation.y = 0.3;
    const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1.16, 0), this.mat('#b2c193', 0.55, 0.15));
    ico.position.set(-4.5, 1.25, -5.5);
    ico.rotation.set(0.2, 0.3, 0.1);
    ico.castShadow = true;
    this.sculptures.add(ico);

    this.box(this.sculptures, [2.6, 1.2, 2.6], [5.4, -2.76, -6.8], stone);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.19, 128, 24), this.mat('#4a614b', 0.28, 0.5));
    knot.position.set(5.4, -0.85, -6.8);
    knot.rotation.set(0.1, 0.5, 0.2);
    knot.castShadow = true;
    this.sculptures.add(knot);

    // These objects intentionally sit outside the central view and can be discovered by leaning.
    this.box(this.hiddenLeft, [1.6, 2.3, 1.6], [0, -2.2, -3], stone);
    const hiddenLeft = new THREE.Mesh(new THREE.SphereGeometry(0.8, 36, 24), orange);
    hiddenLeft.position.set(0, -0.2, -3);
    hiddenLeft.castShadow = true;
    this.hiddenLeft.add(hiddenLeft);
    this.box(this.hiddenRight, [2.5, 4.6, 1], [0, -1.1, -4], dark).rotation.y = -0.3;
    this.hiddenRight.add(this.label('YOU FOUND ME', 0, 1.7, -3.4, 2.2, '#e6b384'));
    this.hiddenTop = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), orange);
    this.hiddenTop.position.set(-1.4, 7.2, -5);
    this.sculptures.add(this.hiddenLeft, this.hiddenRight, this.hiddenTop);
    this.room.add(this.label('01', -5.6, -2.9, -3.7, 0.7));
    this.room.add(this.label('02', 1.7, -2.8, -7, 0.7));
    this.room.add(this.label('03', 6.5, -2.7, -5, 0.7));
  }

  private makeCosmos() {
    const positions: number[] = [];
    let seed = 451;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1800; i++) positions.push((random() - 0.5) * 140, (random() - 0.5) * 90, -random() * 90 - 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#d4dfcf', size: 0.04, sizeAttenuation: true }));
    this.cosmos.add(this.stars);
    const moonGeo = new THREE.IcosahedronGeometry(3, 6);
    const p = moonGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const bump = 1 + 0.01 * Math.sin(x * 16) * Math.cos(y * 17) + 0.006 * Math.sin(z * 35);
      p.setXYZ(i, x * bump, y * bump, z * bump);
    }
    moonGeo.computeVertexNormals();
    this.moon = new THREE.Mesh(moonGeo, this.mat('#a6b7a4', 0.98));
    this.moon.position.set(0, 0.5, -11);
    this.cosmos.add(this.moon);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.016, 8, 160), new THREE.MeshBasicMaterial({ color: '#c8ac86' }));
    orbit.position.copy(this.moon.position);
    orbit.rotation.set(1.05, 0.15, -0.35);
    this.cosmos.add(orbit);
    for (let i = 0; i < 9; i++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + random() * 0.5, 0), this.mat(i % 2 ? '#bd9a72' : '#516755'));
      rock.position.set((random() - 0.5) * 28, (random() - 0.5) * 17, -2 - random() * 17);
      rock.rotation.set(random() * 3, random() * 3, random() * 3);
      this.cosmos.add(rock);
    }
    const grid = new THREE.GridHelper(70, 35, '#65766a', '#293e34');
    grid.position.set(0, -5.2, -23);
    this.cosmos.add(grid);
    this.cosmos.add(this.label('T H E   Q U I E T   O R B I T', 0, -3.8, -16, 5));
  }

  setWorld(world: WorldName) {
    this.world = world;
    this.room.visible = this.sculptures.visible = world === 'gallery';
    this.cosmos.visible = world === 'cosmos';
    const background = world === 'gallery' ? '#242923' : '#101b19';
    this.scene.background = new THREE.Color(background);
    (this.scene.fog as THREE.FogExp2).color.set(background);
    (this.scene.fog as THREE.FogExp2).density = world === 'gallery' ? 0.019 : 0.008;
  }

  private resize() {
    this.width = Math.max(this.container.clientWidth, 1);
    this.height = Math.max(this.container.clientHeight, 1);
    // Preserve the room composition on narrow screens while keeping the screen plane fixed.
    this.halfHeight = this.width / this.height < 1 ? 4.5 : 3;
    const halfWidth = this.halfHeight * this.width / this.height;
    this.hiddenLeft.position.x = -halfWidth * 1.5 - 1.05;
    this.hiddenRight.position.x = halfWidth * (10 / 6) + 1.5;
    this.hiddenTop.position.y = this.halfHeight * (11 / 6) + 1;
    this.renderer.setSize(this.width, this.height);
  }

  private animate = (time: number) => {
    this.frame = requestAnimationFrame(this.animate);
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0.016;
    this.lastTime = time;
    const smoothing = 1 - Math.exp(-12 * dt);
    for (const axis of ['x', 'y', 'z'] as const) this.eye[axis] += (this.target[axis] - this.eye[axis]) * smoothing;
    this.eye.z = clamp(this.eye.z, 3.2, 10);
    this.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
    const f = screenFrustum(this.eye, this.halfHeight * this.width / this.height, this.halfHeight);
    this.camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, f.near, this.camera.far);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    // Camera orientation stays parallel to the screen: never lookAt the scene center.
    if (this.world === 'cosmos') this.moon.rotation.y = time * 0.000025;
    this.renderer.render(this.scene, this.camera);
    this.frameCount++;
    if (time - this.lastMetric > 200) {
      this.onFrame?.(this.eye, Math.round(this.frameCount * 1000 / Math.max(1, time - this.lastMetric)));
      this.frameCount = 0;
      this.lastMetric = time;
    }
  };

  reset() { Object.assign(this.target, { x: 0, y: 0, z: 6 }); }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
  }
}
