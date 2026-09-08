#!/usr/bin/env python3
"""Merge JSONL review captures into monthly public/data/review-data/YYYY/MM.json archives."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            row = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {exc}") from exc
        rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, required=True, help="Directory containing YYYY-MM-DD.jsonl capture files.")
    parser.add_argument("--vocab-dir", type=Path, help="Optional directory containing vocabulary-only YYYY-MM-DD.jsonl capture files.")
    parser.add_argument("--output-root", type=Path, default=Path("public/data/review-data"))
    args = parser.parse_args()

    items: list[dict] = []
    for path in sorted(args.raw_dir.glob("*.jsonl")):
        items.extend(read_jsonl(path))
    if args.vocab_dir and args.vocab_dir.exists():
        for path in sorted(args.vocab_dir.glob("*.jsonl")):
            items.extend(read_jsonl(path))

    groups: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        date = item.get("date") or str(item.get("input_at", ""))[:10]
        year, month = archive_month(date)
        groups[f"{year}/{month}"].append(item)

    written = 0
    for key, month_items in sorted(groups.items()):
        year, month = key.split("/")
        month_items.sort(key=lambda item: (item.get("date", ""), item.get("id", "")), reverse=True)
        output = {
            "generated_at": datetime.now(JST).isoformat(timespec="seconds"),
            "archive_month": key,
            "items": month_items,
        }
        output_path = args.output_root / year / f"{month}.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written += len(month_items)
        print(f"Wrote {len(month_items)} items to {output_path}")
    print(f"Wrote {written} items across {len(groups)} monthly archive(s)")


def archive_month(value: str) -> tuple[str, str]:
    try:
        parsed = datetime.fromisoformat(value[:10])
    except ValueError:
        parsed = datetime.now(JST)
    return f"{parsed.year:04d}", f"{parsed.month:02d}"


if __name__ == "__main__":
    main()
