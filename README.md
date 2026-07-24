# MotionFrame Vue

一个面向运营人员的网页版短视频动画编辑器原型。

## 技术结构

- Vue 3 + TypeScript + Vite：编辑器界面和状态管理
- PixiJS 8：画布渲染、图片元素、拖拽、缩放、旋转和图层
- GSAP：进场、停留、退场动画与时间定位
- Mediabunny + WebCodecs：隐藏画布逐帧渲染并导出 H.264 MP4

项目数据是唯一数据源。PixiJS 场景和 GSAP 时间轴均由项目 JSON 生成，导出时创建独立隐藏场景，不会实时录制编辑画布。

## 已包含的功能

- 上传 PNG、JPG、WebP
- 演示图片素材和基础挂件
- 画布元素选择、拖动、缩放、旋转
- 图层显示、锁定、选择
- 多场景新增、复制、删除和切换
- 9:16、1:1、16:9、4:5 比例
- 进场、停留、退场动画预设
- 动画开始时间、持续时间、力度和缓动
- 时间轴点击定位、逐帧前后移动、循环和播放
- 浏览器本地保存、JSON 导入导出
- 当前场景逐帧导出 MP4，不使用 Worker

## 运行

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
npm run preview
```

建议使用最新版 Chrome 或 Edge。MP4 导出依赖 WebCodecs 的 H.264 编码能力。

## 自动构建和预览

推送到 `main` 后，GitHub Actions 会自动安装依赖、执行构建并部署 `dist` 到 GitHub Pages。

## 主要目录

```text
src/
├── components/                Vue 编辑器界面
├── engine/
│   ├── PixiEditorRenderer.ts  PixiJS 场景与编辑控制层
│   ├── TimelineEngine.ts      GSAP 时间轴编译器
│   └── ExportEngine.ts        隐藏画布逐帧 MP4 导出
├── store/editorStore.ts       项目数据、操作和撤销重做
├── types/editor.ts            项目与动画数据类型
└── utils/                     演示素材和通用函数
```

## 导出机制

对于 5 秒、30 FPS 场景，导出器处理 150 帧：

```text
时间轴定位 frame / fps
→ PixiJS 隐藏画布渲染
→ CanvasSource.add(timestamp, duration)
→ WebCodecs H.264 编码
→ Mediabunny 封装 MP4
```

电脑性能只影响导出耗时，不改变最终成片时长和节奏。
