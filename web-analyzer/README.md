# 哔哩哔哩缓存分析器 · WebUSB

在**浏览器里直连手机**、扫描哔哩哔哩客户端的离线缓存，一键生成画质 / 体积 / 时长 / UP 主 / 弹幕的可视化报告，并可**在线播放**缓存视频（音视频流 + 弹幕）、**流式保存到本地**（完整视频 / 仅画面 / 仅音频 / 弹幕，边拉边写磁盘、任意大小）。全程本地完成，**数据不离开本机**，无需安装 adb、驱动或任何桌面程序。

是仓库根目录 [`main.py`](../main.py) 桌面转码脚本的「纯前端」版本：复用同一套缓存目录结构（`download/<avid>/<sub>/entry.json` + `<type_tag>/{video,audio}.m4s`），但把「插线 → adb pull → 解析 / 播放 / 转码」整条链路搬进了浏览器。

## 技术栈

| 层 | 选型 |
|---|---|
| 构建 | **Vite 8** + React 19 + TypeScript |
| UI | **shadcn/ui** + Tailwind CSS v4（Geist / Geist Mono） |
| 路由 | **react-router**（HashRouter）—— 播放为独立路由页 `#/play/:avid` |
| 设备连接 | **[ya-webadb / Tango](https://github.com/yume-chan/ya-webadb)** —— 浏览器内 WebUSB 实现的 ADB 协议 |
| 播放 | **[ArtPlayer](https://artplayer.org)** + `artplayer-plugin-danmuku` + MSE 双 SourceBuffer + `mp4box`（编码探测） |
| 保存 | **File System Access**（`showSaveFilePicker` 边拉边写磁盘）+ 自研 box 级 fMP4 流式合并（混流，编码无关，不依赖 ffmpeg） |

核心只用到 ADB 的 **sync 子协议**（等价 `adb pull`）遍历目录、读取 `entry.json` 与媒体文件，与桌面 adb 走同一套协议，因此对 Android 11+ 的 `Android/data` 隔离目录同样具备 shell 用户的读取权限。

## 播放与导出

- **流式在线播放**：`video.m4s` / `audio.m4s` 是标准 fragmented-MP4。播放器**不把整段读进内存**，而是从 ADB sync（或 fetch）**边读边喂** MediaSource 的两个 SourceBuffer：增量探测编码 → 背压（超前 ~30s 就暂停读取）→ 配额溢出时驱逐已播放的旧数据。内存因此受限于「数十秒缓冲窗口」，可播放任意大小的缓存视频。`danmaku.xml` 解析为 ArtPlayer 弹幕（滚动 / 顶部 / 底部、颜色还原）。遇到浏览器/系统不支持的编码（如无硬件解码的 HEVC）会提示，但不影响导出。
- **独立路由页**：播放不是弹窗而是独立页面 `#/play/:avid`（宽度随页面布局，不受模态框限制）；分析首页与播放页共享内存态（连接 / 报告），返回不丢状态。刷新播放页因内存态丢失会提示返回首页。
- **分P / 分集**：进入播放页会把同一投稿(avid)的所有分P作为「选集」，可直接切换。
- **画幅自适配**：不同宽高比的视频通过 `object-fit: contain` 在固定播放框内居中 letterbox，不会溢出。
- **流式保存到本地**：三种方式都**先弹出保存位置**（File System Access），再从手机边拉边写磁盘，内存只驻留在途分片，**可保存任意大小**（不会 `Array buffer allocation failed`）：
  - **完整视频**：`video.m4s` + `audio.m4s` → 单文件 `.mp4`。用自研 [box 级 fMP4 流式合并器](src/lib/remux.ts)：合成一个双轨 moov（音频轨改号避免冲突），再按 `tfdt` 解码时间交织 `moof+mdat` 分片写出。**不解码、不碰编码**，因此 AVC/HEVC/AV1/AAC 通吃，也不需要 ffmpeg / wasm。
  - **仅画面** → `.mp4`（原始视频流）；**仅音频** → `.m4a`（原始音频流）；**弹幕** → `.xml`。
  - 多P视频文件名带 `P序号` 避免重名。
- 不支持 File System Access 的浏览器回退到内存 Blob 下载（受内存限制）。

## 运行

```bash
pnpm install
pnpm dev      # 开发服务器
pnpm build    # 类型检查 + 生产构建
```

打开页面后：

1. 手机开启「开发者选项 → USB 调试」，用数据线连接电脑；
2. **先关闭电脑上占用设备的 adb server**（`adb kill-server`），否则 WebUSB 无法独占该设备；
3. 点击「连接手机并扫描」，在浏览器弹窗中选择设备并授权；
4. 自动扫描缓存目录并生成报告。可在包名框改成其它客户端包名（默认 `tv.danmaku.bilj`）。

没有手机也可以点「**载入示例**」查看真实数据（140 条目）生成的完整报告。

## 限制

- **仅 Chromium 内核浏览器**（Chrome / Edge / Opera）支持 WebUSB；需 `https` 或 `localhost` 安全上下文。
- 同一时刻一个 USB 设备只能被一个 ADB 客户端占用（见上文第 2 步）。

## 目录

```
src/
  lib/
    bili.ts      # 纯领域逻辑：解析 entry.json、聚合统计、格式化（无 ADB / DOM 依赖，可测试）
    adb.ts       # WebUSB ↔ ADB 连接层，sync 遍历 + 读取 entry.json / m4s / 弹幕
    media.ts     # 弹幕解析、mp4box 编码探测、MSE 双流播放
    remux.ts     # box 级 fMP4 流式合并器（video+audio → 单文件 mp4，编码无关，无 ffmpeg）
    download.ts  # File System Access 流式保存 + Blob 回退
  components/     # Header / Onboarding / Report / VideoTable / PlayerView ...
  pages/
    PlayerPage.tsx     # 播放路由页：从 URL(avid) + 共享状态取出选集
  store.ts        # 跨路由共享的应用状态（连接 / 报告）context
public/
  demo/           # 示例媒体：video.m4s / audio.m4s / danmaku.xml / cover.jpg
scripts/
  verify-fixtures.ts  # 用真实 entry.json 校验聚合逻辑与桌面脚本一致
  gen-sample.ts       # 从真实缓存生成 public/sample-items.json 示例数据
```

`bili.ts` 的解析/聚合逻辑已用真机拉取的 140 份 `entry.json` 交叉验证，与桌面 Python 分析结果一致。
