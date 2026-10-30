# BEYOND · 屏幕之外

把显示器当作一扇通向虚拟空间的窗户。摄像头估算双眼位置，通过非对称视锥让屏幕边框保持固定，让深处的物体随视点产生运动视差，露出原本被边缘挡住的部分。

## 运行

需要 Node.js 22.12+（推荐 Node.js 24）。

```sh
npm ci
npm run dev
```

打开终端显示的 localhost 地址。首次开启摄像头后面向屏幕，点击「校准中心」，再左右、上下、前后轻移头部。关闭摄像头或切回鼠标预览会立即停止摄像头视频轨道。

- 鼠标移动：模拟眼睛在屏幕前的位置。
- 方向键：聚焦 3D 区域后移动视点。
- R：复位 / 重新校准头部中心。
- F：全屏 / 退出全屏。
- 两个空间、视差强度调整、摄像头画面预览均可直接操作。

## 实现

- Three.js：程序化展厅、雕塑、深空场景、实时光照和阴影。
- MediaPipe Face Landmarker：双眼中心提供 X/Y 平移，眼间距变化估计相对 Z 距离；平滑后更新离轴投影矩阵，不对场景中心执行 `lookAt`。
- 追踪模型与 WASM 文件随网站一起提供。视频只在浏览器本机处理，不发送到服务器、不录制。摄像头仅在用户主动点击后请求权限。
- 需要 HTTPS 或 localhost；无摄像头、拒绝授权、设备占用、人脸暂时丢失、WebGL 不可用时有对应反馈。GPU 追踪失败时尝试 CPU。

这是单目摄像头的相对位置估计。校准时的姿势被视为屏幕正前方；默认屏幕尺寸与观看距离是近似值。头部大幅旋转、弱光或人脸离开镜头会降低精度。普通显示器提供运动视差，不提供双眼立体成像。

## 验证与构建

```sh
npm test
npm run build
npm run preview
```

投影测试覆盖屏幕四角在 X/Y/Z 移动时保持固定、遮挡物随视点移动而显露、追踪坐标方向与距离估计、非法视点边界。构建产物位于 `dist/`，可托管为静态网站。

## 资源来源

场景和图形均由代码生成。Face Landmarker 模型来源：[Google MediaPipe 官方模型](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)。WASM 来自锁定版本的 `@mediapipe/tasks-vision`。字体为 Google Fonts 的 DM Sans；中文使用系统字体。
