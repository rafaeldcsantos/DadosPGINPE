#!/usr/bin/env python3
"""Summarize INPE artpe article-author aggregates by year and program."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Summarize article-level CAPES artpe author counts into year/program totals."
        )
    )
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=Path("Data/inpe_artpe_autores_por_artigo_2013_2024_glosa0.csv"),
        help="Article-level input CSV path.",
    )
    parser.add_argument(
        "--output-csv",
        type=Path,
        default=Path("Data/inpe_artpe_resumo_ano_programa_2013_2024_glosa0.csv"),
        help="Year/program summary CSV path.",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=Path("Data/inpe_artpe_resumo_ano_programa_2013_2024_glosa0.json"),
        help="Year/program summary JSON path.",
    )
    parser.add_argument(
        "--output-log-json",
        type=Path,
        default=Path("Data/logs/inpe_artpe_resumo_ano_programa_2013_2024_glosa0_log.json"),
        help="Execution log JSON path.",
    )
    return parser.parse_args()


def safe_int(value: str) -> int:
    text = str(value or "").strip()
    if text == "":
        return 0
    try:
        return int(text)
    except ValueError:
        try:
            number = float(text.replace(",", "."))
            return int(number)
        except ValueError:
            return 0


def safe_year(value: str) -> int:
    try:
        return int(str(value).strip())
    except ValueError:
        return 999999


def main() -> int:
    args = parse_args()

    if not args.input_csv.exists():
        raise SystemExit(f"Input not found: {args.input_csv}")

    with args.input_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        if not fieldnames:
            raise SystemExit(f"Input CSV has no header: {args.input_csv}")

        required = [
            "id_add_producao_intelectual",
            "an_base",
            "sg_entidade_ensino",
            "cd_programa_ies",
            "nm_programa_ies",
            "qtd_autores_total",
        ]
        missing = [col for col in required if col not in fieldnames]
        if missing:
            raise SystemExit(f"Missing required columns in input CSV: {missing}")

        tp_count_columns = [col for col in fieldnames if col.startswith("qtd_tp_autor_")]
        if not tp_count_columns:
            raise SystemExit("No TP_AUTOR count columns found in input CSV.")

        grouped: Dict[Tuple[str, str], Dict[str, object]] = {}
        rows_input = 0
        sg_values = set()
        programs = set()
        years = set()
        inconsistent_program_name_rows = 0

        for row in reader:
            rows_input += 1
            an_base = str(row.get("an_base", "")).strip()
            cd_programa = str(row.get("cd_programa_ies", "")).strip()
            nm_programa = str(row.get("nm_programa_ies", "")).strip()
            sg = str(row.get("sg_entidade_ensino", "")).strip()

            if not an_base or not cd_programa:
                continue

            key = (an_base, cd_programa)
            sg_values.add(sg)
            programs.add(cd_programa)
            years.add(an_base)

            if key not in grouped:
                grouped[key] = {
                    "an_base": an_base,
                    "cd_programa_ies": cd_programa,
                    "nm_programa_ies": nm_programa,
                    "qtd_artigos": 0,
                    "qtd_autores_total": 0,
                }
                for col in tp_count_columns:
                    grouped[key][col] = 0
            else:
                current_name = str(grouped[key]["nm_programa_ies"])
                if nm_programa and current_name and nm_programa != current_name:
                    inconsistent_program_name_rows += 1

            grouped[key]["qtd_artigos"] = int(grouped[key]["qtd_artigos"]) + 1
            grouped[key]["qtd_autores_total"] = int(grouped[key]["qtd_autores_total"]) + safe_int(
                row.get("qtd_autores_total", "0")
            )
            for col in tp_count_columns:
                grouped[key][col] = int(grouped[key][col]) + safe_int(row.get(col, "0"))

    rows_output = list(grouped.values())
    rows_output.sort(
        key=lambda r: (
            safe_year(str(r["an_base"])),
            str(r["cd_programa_ies"]),
        )
    )

    output_fieldnames = [
        "an_base",
        "cd_programa_ies",
        "nm_programa_ies",
        "qtd_artigos",
        "qtd_autores_total",
        *tp_count_columns,
    ]

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=output_fieldnames)
        writer.writeheader()
        writer.writerows(rows_output)

    json_payload = {
        "dataset": "inpe_artpe_resumo_ano_programa_2013_2024_glosa0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_csv": str(args.input_csv),
        "rows_input": rows_input,
        "rows_output": len(rows_output),
        "years": sorted(years, key=safe_year),
        "program_count": len(programs),
        "sg_entidade_ensino_values": sorted(sg_values),
        "tp_autor_count_columns": tp_count_columns,
        "records": rows_output,
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(json_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    log_payload = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "input_csv": str(args.input_csv),
        "output_csv": str(args.output_csv),
        "output_json": str(args.output_json),
        "rows_input": rows_input,
        "rows_output": len(rows_output),
        "years_covered": sorted(years, key=safe_year),
        "program_count": len(programs),
        "sg_values": sorted(sg_values),
        "tp_autor_count_columns": tp_count_columns,
        "inconsistent_program_name_rows": inconsistent_program_name_rows,
    }
    args.output_log_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_log_json.write_text(
        json.dumps(log_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Input rows: {rows_input}")
    print(f"Output rows: {len(rows_output)}")
    print(f"Years: {sorted(years, key=safe_year)}")
    print(f"Programs: {len(programs)}")
    print(f"SG values: {sorted(sg_values)}")
    print(f"Output CSV: {args.output_csv}")
    print(f"Output JSON: {args.output_json}")
    print(f"Output log: {args.output_log_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
