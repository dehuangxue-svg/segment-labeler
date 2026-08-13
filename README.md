# Segment Labeler

Segment Labeler is an open-source desktop application for splitting videos into temporal segments, assigning positive or negative class labels, and exporting a training-ready dataset. Processing stays on your computer.

中文说明见下方。

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

Segment Labeler 是一个通用的本地视频分段与训练样本标注工具。开源版不预设任何正负样本内容，用户可以自行新增和删除类别。

- 支持英语、简体中文、繁体中文、日语、韩语和西班牙语，并会记住语言设置。
- 支持 macOS 和 Windows；Windows 同时提供安装版和便携版。
- 视频、项目和标注数据都保留在本地，不会上传。
- 导出的 JSON 可用于时序视频分类模型的数据加载与训练。

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). English is the source locale; new languages can be added as independent files under `src/locales/`.

## License

[MIT](LICENSE)
