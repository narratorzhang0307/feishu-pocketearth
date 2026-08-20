# Whisplay 动态头像 + 多脚本字体（树莓派）

音乐DJ 方盒子头像在 Whisplay 屏上的原生实现。网页端那套 frost-avatar（React+SVG 的 483
造型）被原生移植到树莓派的 **Python/PIL** 渲染，按当前播放城市的流派/状态**轮播 + 律动**，
并用**逐字字体回退**确保世界各地歌名都不出方框。

> 用户可见处一律称「音乐DJ / DJ」；frost / pose / FrostBox 只是内部代号。

## 文件

| 文件 | 作用 |
|---|---|
| `frost_avatar.py` | PIL 渲染器：483 pose + 51 色板 + 22 律动 + 城市/流派/情绪/轮播逻辑 |
| `frost_poses.json` | Frost 统一造型数据（pose + 色板） |
| `whisplay_status.py` | 状态屏主程序：拉 pi-state → 画全屏（含头像）→ 律动动画 + 逐字字体回退 |

## 头像怎么动

- **轮播**：`whisplay_status.py` 主循环每 `SUNSET_AVATAR_ROTATE_SEC`（默认 6s）换一张造型。
  - 播**真实城市**时：轮播该城市流派的全部表情（`avatar_pool` → 该 genre 的 pose，稳定打散）。
  - **待机/非城市**（语音控制/日落电台等）：轮播全 483 张 showcase（按流派交错+情绪打散排列，相邻不同）。
  - 池只在 city/流派切换时重置（`pool_key`），同池就接着轮 → 脸不会被 2.5s 状态轮询带跳。
- **律动**：`SUNSET_AVATAR_FPS`（默认 14）帧/秒，只重画并推送**头像区那块矩形**
  （`AV_RX/RY/RW/RH`，mmap framebuffer 支持子区域），省 CPU/SPI。
  - 分层缓存：`bg_region`（DARK+静态底圈）+ `body_tile`（身体，每张缓存一次）；逐帧只做
    `render_region`（按 `motion_transform` 变换 body 再贴图）。`rgb565_bytes` 用 numpy 向量化。
  - 22 种律动 port 自 `frostBox.css` 的 @keyframes（绕脚底；spin/spinjump 用横向挤压近似 3D 转身）。
- Pi5 实测：单帧约 1.6ms，进程 CPU 约 6-8%。

## 多脚本逐字字体回退

Whisplay 是 PIL 一笔笔画的，**PIL 一次只用一个字体、不像浏览器那样自动回退**。所以
`whisplay_status.py` 自带逐字回退（`_font_for_char` / `fb_draw` / `fb_fit`）：

- 每个字符挑**回退链**里第一个真有它字形的字体：wqy-zenhei（中日韩+拉丁+西里尔+希腊+假名+谚文）
  → Noto 各脚本（泰/阿/扩展拉丁/希伯来/天城）→ DejaVu → **unifont**（覆盖几乎全 Unicode 的终极兜底）。
- 覆盖检测：`bytes(font.getmask(ch))` 与「私用区 notdef 基准位图」比对（注意 getmask 返回
  ImagingCore，要用 `bytes()` 不是 `.tobytes()`）。
- 连续同字体字符合并成 run 一次画出 → 保留 Pillow raqm 的复杂脚本塑形。
- 城市 / 曲目 / 歌手三处用它；标题/SUNSET RADIO/时间是中文或 ASCII，仍用单字体 `font()`。

字体由 `deploy-raspi.local.sh` 安装：`fonts-wqy-zenhei fonts-noto-core fonts-unifont`。

## 可调环境变量

| 变量 | 默认 | 作用 |
|---|---|---|
| `SUNSET_AVATAR_ROTATE_SEC` | 6 | 每张造型停留秒数 |
| `SUNSET_AVATAR_FPS` | 14 | 律动帧率 |

## 排错

- **头像不动 / 只一张脸**：ssh 到 Pi `grep -c ANIM_FPS whisplay_status.py`，0 = 跑的是旧版
  （被从 main 树部署冲掉了），重新 rsync 本分支的 `frost_avatar.py whisplay_status.py
  frost_poses.json` 并 `systemctl restart sunset-radio-whisplay`。
- **歌名方框**：`fc-list | grep -i thai`（没有就 `apt install fonts-noto-core fonts-unifont`）。
- **想看效果**：从 framebuffer 抓帧 `/tmp/whisplay-fb-*`（RGB565，240×280，字节序高位在前）。

## 加新造型

造型数据来自 Frost 统一形象资源中的 `src/modules/frost-avatar/poses/`，改完用
`dump.mjs`（esbuild 打包数据层）重新导出 `frost_poses.json`。渲染器是数据驱动的，加数据即可，
未实现的部件/律动会 graceful 兜底。
