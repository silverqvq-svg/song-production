# song-production

**一套给 AI agent 用的编曲技能包：把"好听"拆成可以测量的量。**

A skill package for AI agents that write and mix music — turning "this sounds harsh"
into numbers you can act on.

---

## 这是什么

大多数音乐工具库解决的是"怎么合成一个音"。这个仓库解决的是另一个问题：

> 当听的人说"太吵了""太尖了""副歌没接住""这个声音是什么"——
> **怎么定位到具体哪一轨、哪一秒、差多少 dB，然后只改那一处。**

核心是一套**消去法（mute-and-measure）诊断流程**：

```
node tools/diff.js FULL.wav minus_guitar.wav minus_synth.wav
```

逐个静音某轨，测量"被拿走的那部分信号"的 RMS、频谱重心、高频能量占比。
**哪一轨被拿走的高频最多，哪一轨就是元凶**——不用猜，也不用靠形容词。

配合 `spectrum.js`（音色明亮度）、`density.js`（编曲拥挤度）、
`decay.js`（鼓的衰减曲线），把听觉问题变成可比较的数字。

## 它是怎么来的

不是设计出来的，是**做一首完整的歌时踩出来的**：

- F 大调 / 112 BPM / 74 小节 / 2 分 42 秒的 city pop
- 全程无 GUI，纯 Node 脚本：手写 MIDI 写入器 → 软音源 → 自己写的混音链 → 成品 WAV
- 期间定位并修复了十几个真实问题：一轨锯齿波主音被听成"铜管"、
  母线上的空气感提升让钢琴"发尖"、一轨高音区电吉他造成"分散的毛刺"、
  鼓的衰减拖沓……

**所以里面的数字只验证过一次。** 把它当起点，不要当铁律。
`SKILL.md` 第 3 节（抓耳写法）尤其如此——它来自单首歌的经验。

## 快速开始

```bash
# 1. 取素材（约 40 MB：一个 MIT 许可的全 GM 音源）
node tools/fetch-assets.js
#    真钢琴可选（1.2 GB，CC-BY，需署名）——会打印获取指引
node tools/fetch-assets.js --piano

# 2. 出成品
node tools/compose.js                 # 写乐谱
node tools/export-stems.js            # 拆成单轨 MIDI
node tools/render-stems.js            # 每轨渲染成音频（需要 FluidSynth）
node tools/render.js                  # 混音 + 母带 -> out/midnight_signal.wav
```

约 5 秒出音频。`tools/compose.js` 里是那首完整的歌，可以直接改成你自己的。

**环境要求**：Node.js 18+。**无 npm 依赖**，也**不需要 PowerShell**——
所有脚本都是 Node，Windows / macOS / Linux 都能跑。

> ⚠️ `render-stems.js` 需要 FluidSynth。Windows 上下载官方 zip 解压到
> `assets/fluidsynth/`，macOS/Linux 用 `brew install fluidsynth` /
> `apt install fluidsynth` 即可，脚本会自动在 PATH 里找。

### 可复现性

在干净的 `out/` 上跑完整条管线，产出的 WAV 与发布时验证的成品
**逐字节一致**（MD5 `1CA3344F…`）。`tools/render-stems.js` 里的
`GM_GAIN = 0.8` / `GAIN_OVERRIDE` 就是为此存在的——改动它们会让每一轨的电平整体偏移。

## 目录

```
SKILL.md          <- 主角：给 AI agent 的技能说明
tools/            <- 17 个 Node 脚本
docs/findings.md  <- 完整的测量数据（SKILL.md 里那些结论的原始出处）
assets/           <- 音源，不进 git（fetch-assets.js 下载）
out/              <- 产物，不进 git
```

## 调试开关

做 A/B 不用改代码——`render.js` 读环境变量：

```
SP_SOLO="Ac.Piano"     只渲染这一轨          SP_MUTE="Guitar R"   静音某轨
SP_START=34 SP_SECS=17 只导出某一段          SP_GAIN="Drums=3.0"  临时改增益
SP_NOFX=chor|air       关掉合唱/空气感       SP_DRUMRATE=1.45     鼓的衰减速率
```

## 已知的不足

- **旋律重复率只做到 12.5%**，真实流行歌是 23.2%。这是"抓耳"上最大的差距，尚未解决。
- `tools/compose.js` 是**一首具体的歌**，不是模板系统。改歌要改代码。
- `pop909-analyze.js` 需要自行下载 POP909 数据集，且该数据集的许可需自行确认。
- 没有测试。这些脚本是为一个项目写的一次性工具，后来才整理出来的。

## 许可

代码 MIT（见 `LICENSE`）。`SKILL.md` 与 `docs/` 的文字建议同样以 CC-BY-4.0 释出。

**第三方素材**：仓库不打包任何音源，全部由 `tools/fetch-assets.js` 从官方源下载。
各自的许可证与署名要求见 `THIRD-PARTY.md`。其中 Salamander Grand Piano 是
**CC-BY，使用时必须署名 Alexander Holm**。
