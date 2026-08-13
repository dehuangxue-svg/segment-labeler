# Video Segment Annotator

**Video Segment Annotator** is an open-source desktop application for turning a long video into labeled training samples. It lets you set precise cut points, review every time range, assign positive or negative classes, and export both video clips and machine-readable annotations. All video processing and project data stay on your own computer.

中文说明见下方。

This project is a general-purpose video slicing and annotation tool: it deliberately starts with no preset labels, so it can be used for product footage, activity recognition, quality review, research, or any other temporal video-classification workflow.

## What it does

1. Open a local video and divide it into time segments using the keyboard or timeline.
2. Fine-tune each boundary without losing its neighboring segment labels.
3. Define your own positive and negative classes, then annotate every usable segment.
4. Export individual clips, `annotations.json`, and `label_map.json` in a stable, training-oriented structure.

## Features

- Drag and drop MP4, MOV, MKV, WebM, or M4V videos.
- Press `Space` to split at the playhead, with optional pause-after-cut behavior.
- Click a cut once to select it; drag it again to fine-tune the boundary.
- Seek on the upper timeline ruler and box-select cuts on the lower track.
- Hold `Command` on macOS or `Ctrl` on Windows and scroll to zoom.
- Use playback speeds from `0.25×` to `10.00×`.
- Create and remove your own positive and negative labels. No domain labels are preset.
- Save progress automatically beside the source video as `<video>.vsl.json`.
- Export clips plus `annotations.json` and `label_map.json` for local model training.
- Switch the interface between English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and Spanish.

## Keyboard controls

| Key | Action |
| --- | --- |
| `Space` | Insert a cut |
| `K` | Play or pause |
| `←` / `→` | Move one frame; adjust a selected cut by one frame |
| `Shift + ←` / `Shift + →` | Move or adjust by one second |
| `Command/Ctrl + Z` | Undo |
| `Command/Ctrl + Shift + Z` | Redo |
| `Command/Ctrl + S` | Save now |

## Dataset output

```text
source_video_dataset/
├── annotations.json
├── label_map.json
└── videos/
    ├── positive/<class>/*.mp4
    └── negative/<class>/*.mp4
```

`annotations.json` uses temporal video classification records with seconds, frames, polarity, class IDs, display names, notes, and relative clip paths. The JSON Schema is in `schemas/annotations.schema.json`.

## Run locally

Prerequisites: Node.js 22+, FFmpeg, and FFprobe.

```bash
npm ci
npm test
npm start
```

## Build installers

```bash
npm run dist:mac   # macOS: DMG and ZIP
npm run dist:win   # Windows: NSIS installer and portable EXE
```

GitHub Actions builds both platforms natively on every push to `main`, release tag, and pull request.

## 中文说明

**视频切片标注器** 是一个通用的本地视频切片、时间段标注与训练样本导出工具。它用于把长视频切成有明确时间边界的片段，再为每段添加正样本或负样本类别，最后导出视频片段和可供本地模型训练使用的 JSON 标注数据。

开源版不预设任何正负样本内容，用户可以自行新增、删除和命名类别。因此它可以用于商品视频、行为识别、质检、研究或任何时序视频分类场景。

- 支持英语、简体中文、繁体中文、日语、韩语和西班牙语，并会记住语言设置。
- 支持 macOS 和 Windows；Windows 同时提供安装版和便携版。
- 视频、项目和标注数据都保留在本地，不会上传。
- 导出的 JSON 可用于时序视频分类模型的数据加载与训练。

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). English is the source locale; new languages can be added as independent files under `src/locales/`.

## License

[MIT](LICENSE)

## Acknowledgements

Video Segment Annotator is an independent MIT-licensed implementation. Its local video-annotation workflow was informed by [X-AnyLabeling](https://github.com/CVHub520/X-AnyLabeling); its FFmpeg-based export approach and localization practices were informed by [LosslessCut](https://github.com/mifi/lossless-cut) and [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit). Media probing and export rely on [FFmpeg](https://ffmpeg.org/).

Thank you to these open-source projects and their maintainers for sharing their work. We also thank [OpenAI](https://openai.com/) for the development assistance that helped turn the workflow into this open-source application. This project is independent and is not affiliated with those projects or organizations.
