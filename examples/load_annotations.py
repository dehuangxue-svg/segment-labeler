"""Minimal local-training loader for annotations.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_samples(dataset_dir: str | Path) -> list[dict[str, Any]]:
    root = Path(dataset_dir)
    manifest = json.loads((root / "annotations.json").read_text(encoding="utf-8"))
    if manifest.get("dataset_type") != "temporal_video_classification":
        raise ValueError("Unsupported dataset type")

    samples = []
    for item in manifest["annotations"]:
        clip_path = root / item["clip_path"]
        if not clip_path.is_file():
            raise FileNotFoundError(clip_path)
        samples.append(
            {
                "video_path": str(clip_path),
                "target": item["class_id"],
                "target_name": item["class_name"],
                "is_positive": item["sample_type"] == "positive",
                "duration_sec": item["duration_sec"],
            }
        )
    return samples


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_dir")
    args = parser.parse_args()
    loaded = load_samples(args.dataset_dir)
    print(f"Loaded {len(loaded)} samples")
