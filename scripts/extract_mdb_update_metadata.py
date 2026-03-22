#!/usr/bin/env python3
"""Extract update metadata from an Access MDB into Data/mdb_metadata.json."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


DATE_FMT = "%m/%d/%y %H:%M:%S"


@dataclass
class ObjectDate:
    object_name: str
    object_type: Optional[int]
    date_create: Optional[datetime]
    date_update: datetime


def run_cmd(args: list[str]) -> str:
    proc = subprocess.run(args, capture_output=True, text=True, check=True)
    return proc.stdout


def parse_mdb_date(value: str) -> Optional[datetime]:
    raw = value.strip().strip('"')
    if not raw:
        return None
    try:
        return datetime.strptime(raw, DATE_FMT)
    except ValueError:
        return None


def parse_int(value: str) -> Optional[int]:
    raw = value.strip().strip('"')
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def find_latest_mdb(raw_dir: Path) -> Path:
    candidates = sorted(raw_dir.glob("*.mdb"))
    if not candidates:
        raise FileNotFoundError(f"No .mdb files found in {raw_dir}")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def extract_object_dates(mdb_path: Path) -> tuple[list[ObjectDate], int]:
    output = run_cmd(
        [
            "mdb-export",
            "-b",
            "strip",
            "-d",
            "\t",
            str(mdb_path),
            "MSysObjects",
        ]
    )

    reader = csv.DictReader(io.StringIO(output), delimiter="\t")
    rows: list[ObjectDate] = []
    total_rows = 0

    for row in reader:
        total_rows += 1
        date_update = parse_mdb_date(row.get("DateUpdate", ""))
        if date_update is None:
            continue
        rows.append(
            ObjectDate(
                object_name=row.get("Name", "").strip().strip('"'),
                object_type=parse_int(row.get("Type", "")),
                date_create=parse_mdb_date(row.get("DateCreate", "")),
                date_update=date_update,
            )
        )

    return rows, total_rows


def extract_filename_date(mdb_path: Path) -> Optional[str]:
    match = re.search(r"(\d{8})(?=\.mdb$)", mdb_path.name, flags=re.IGNORECASE)
    if not match:
        return None
    raw = match.group(1)
    try:
        return datetime.strptime(raw, "%Y%m%d").date().isoformat()
    except ValueError:
        return None


def detect_mdb_format(mdb_path: Path) -> Optional[str]:
    try:
        return run_cmd(["mdb-ver", str(mdb_path)]).strip() or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def build_metadata(mdb_path: Path) -> dict:
    stat = mdb_path.stat()
    object_dates, total_rows = extract_object_dates(mdb_path)
    latest = max(object_dates, key=lambda x: x.date_update) if object_dates else None

    metadata = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_file": str(mdb_path),
        "source_file_name": mdb_path.name,
        "source_file_size_bytes": stat.st_size,
        "source_file_modified_utc": datetime.fromtimestamp(
            stat.st_mtime, tz=timezone.utc
        ).isoformat(),
        "source_filename_date": extract_filename_date(mdb_path),
        "mdb_format": detect_mdb_format(mdb_path),
        "msysobjects": {
            "rows_scanned": total_rows,
            "rows_with_valid_dateupdate": len(object_dates),
            "latest_object_dateupdate": latest.date_update.isoformat() if latest else None,
            "latest_object_name": latest.object_name if latest else None,
            "latest_object_type": latest.object_type if latest else None,
            "latest_object_datecreate": latest.date_create.isoformat()
            if latest and latest.date_create
            else None,
        },
    }
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract MDB update metadata into a JSON file."
    )
    parser.add_argument(
        "--mdb",
        type=Path,
        default=None,
        help="Path to .mdb file. Default: latest .mdb in RawData/",
    )
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=Path("RawData"),
        help="Directory to search for .mdb when --mdb is not provided.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("Data/mdb_metadata.json"),
        help="Output JSON path.",
    )
    args = parser.parse_args()

    mdb_path = args.mdb if args.mdb else find_latest_mdb(args.raw_dir)
    if not mdb_path.exists():
        raise FileNotFoundError(f"MDB file not found: {mdb_path}")

    metadata = build_metadata(mdb_path)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Metadata written to: {args.output}")


if __name__ == "__main__":
    main()
