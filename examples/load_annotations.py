"""Minimal multi-label training loader for annotations.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_samples(dataset_dir: str | Path) -> tuple[list[dict[str, Any]], list[str]]:
    root = Path(dataset_dir)
    manifest = json.loads((root / "annotations.json").read_text(encoding="utf-8"))
    if manifest.get("dataset_type") not in {
        "temporal_video_classification",
        "temporal_video_multilabel_classification",
    }:
        raise ValueError("Unsupported dataset type")

    label_ids = [label["id"] for label in manifest["label_map"]]
    label_index = {label_id: index for index, label_id in enumerate(label_ids)}
    samples = []
    for item in manifest["annotations"]:
        clip_path = root / item["clip_path"]
        if not clip_path.is_file():
            raise FileNotFoundError(clip_path)
        item_label_ids = item.get("label_ids", [item["class_id"]])
        targets = [0.0] * len(label_ids)
        for label_id in item_label_ids:
            targets[label_index[label_id]] = 1.0
        samples.append(
            {
                "video_path": str(clip_path),
                "targets": targets,
                "label_ids": item_label_ids,
                "labels_by_group": item.get("labels_by_group", {}),
                "is_positive": item["sample_type"] == "positive",
                "duration_sec": item["duration_sec"],
            }
        )
    return samples, label_ids


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_dir")
    args = parser.parse_args()
    loaded, label_ids = load_samples(args.dataset_dir)
    print(f"Loaded {len(loaded)} samples with {len(label_ids)} labels")
