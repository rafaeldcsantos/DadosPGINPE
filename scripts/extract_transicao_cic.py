#!/usr/bin/env python3
"""Build Mestrado->Doutorado transition matrix using CIC as student identifier."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional


PROGRAM_ORDER = ["PGAST", "PGCAP", "PGCST", "PGMET", "PGETE", "PGGES", "PGSER"]
OUTROS = "Outros"
CATEGORY_ORDER = PROGRAM_ORDER + [OUTROS]
MDB_DATETIME_FORMATS = ("%m/%d/%y %H:%M:%S", "%m/%d/%y")


def run_cmd(args: list[str]) -> str:
    proc = subprocess.run(args, capture_output=True, text=True, check=True)
    return proc.stdout


def clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip().strip('"').strip()
    return text or None


def normalize_reg_aluno(raw: Optional[str]) -> Optional[str]:
    text = clean_text(raw)
    if not text:
        return None

    digits: Optional[str] = None
    if re.fullmatch(r"\d+", text):
        digits = text
    else:
        try:
            number = Decimal(text)
        except InvalidOperation:
            return None
        if number != number.to_integral_value():
            return None
        digits = str(int(number))

    if len(digits) < 5:
        return None

    return f"{digits[:-4]}/{digits[-4:]}"


def normalize_cic(raw: Optional[str]) -> Optional[str]:
    text = clean_text(raw)
    if not text:
        return None
    digits = re.sub(r"\D+", "", text)
    return digits or None


def parse_mdb_date(raw: Optional[str]) -> Optional[datetime]:
    text = clean_text(raw)
    if not text:
        return None
    for fmt in MDB_DATETIME_FORMATS:
        try:
            dt = datetime.strptime(text, fmt)
            if dt.year > datetime.now().year:
                dt = dt.replace(year=dt.year - 100)
            return dt
        except ValueError:
            continue
    return None


def normalize_nivel(raw: Optional[str]) -> Optional[str]:
    text = clean_text(raw)
    if not text:
        return None
    low = text.lower()
    if low.startswith("mestr"):
        return "Mestrado"
    if low.startswith("dout"):
        return "Doutorado"
    return None


def normalize_programa_7(raw_sigla: Optional[str]) -> Optional[str]:
    sigla = clean_text(raw_sigla)
    if not sigla:
        return None

    code = sigla.upper()
    if code.startswith("ANS"):
        return "PGCAP"
    if code.startswith("ETE"):
        return "PGETE"
    if code.startswith("CEA") or code.startswith("GES"):
        return "PGGES"
    if code.startswith("AST"):
        return "PGAST"
    if code.startswith("CAP"):
        return "PGCAP"
    if code.startswith("CST"):
        return "PGCST"
    if code.startswith("MET"):
        return "PGMET"
    if code.startswith("SER"):
        return "PGSER"
    if code in set(PROGRAM_ORDER):
        return code
    return None


def find_latest_mdb(raw_dir: Path) -> Path:
    candidates = sorted(raw_dir.glob("*.mdb"))
    if not candidates:
        raise FileNotFoundError(f"No .mdb files found in {raw_dir}")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def export_table_rows(mdb_path: Path, table: str) -> list[dict]:
    output = run_cmd(["mdb-export", "-b", "strip", "-d", "\t", str(mdb_path), table])
    reader = csv.DictReader(io.StringIO(output), delimiter="\t")
    return list(reader)


def build_reg_to_cic(mdb_path: Path) -> tuple[dict[str, str], dict]:
    rows = export_table_rows(mdb_path, "GDRPESS")
    mapping: dict[str, str] = {}

    skipped_invalid_reg = 0
    skipped_empty_cic = 0
    duplicate_same_cic = 0
    duplicate_conflict_cic = 0

    for row in rows:
        reg = normalize_reg_aluno(row.get("REG_ALUNO"))
        if not reg:
            skipped_invalid_reg += 1
            continue

        cic = normalize_cic(row.get("CIC"))
        if not cic:
            skipped_empty_cic += 1
            continue

        if reg in mapping:
            if mapping[reg] == cic:
                duplicate_same_cic += 1
            else:
                duplicate_conflict_cic += 1
            continue

        mapping[reg] = cic

    log = {
        "records_total": len(rows),
        "reg_to_cic_count": len(mapping),
        "records_skipped_invalid_reg_aluno": skipped_invalid_reg,
        "records_skipped_empty_cic": skipped_empty_cic,
        "duplicate_reg_same_cic": duplicate_same_cic,
        "duplicate_reg_conflicting_cic": duplicate_conflict_cic,
    }
    return mapping, log


def choose_level_program(entries: list[dict]) -> Optional[str]:
    recognized = [entry for entry in entries if entry["programa"] in set(PROGRAM_ORDER)]
    if not recognized:
        return None

    ranked = sorted(
        recognized,
        key=lambda entry: (
            entry["d_adimissa"] is None,
            entry["d_adimissa"] or datetime.max,
            entry["reg_aluno"],
        ),
    )
    return ranked[0]["programa"]


def build_transition(
    mdb_path: Path, reg_to_cic: dict[str, str]
) -> tuple[dict[tuple[str, str], int], dict]:
    rows = export_table_rows(mdb_path, "CURSO_AL")

    students: dict[str, dict[str, list[dict]]] = defaultdict(
        lambda: {"Mestrado": [], "Doutorado": []}
    )

    skipped_invalid_reg = 0
    skipped_non_md_level = 0
    skipped_without_cic = 0

    for row in rows:
        reg = normalize_reg_aluno(row.get("REG_ALUNO"))
        if not reg:
            skipped_invalid_reg += 1
            continue

        nivel = normalize_nivel(row.get("NIVEL"))
        if nivel is None:
            skipped_non_md_level += 1
            continue

        cic = reg_to_cic.get(reg)
        if cic is None:
            skipped_without_cic += 1
            continue

        students[cic][nivel].append(
            {
                "reg_aluno": reg,
                "programa": normalize_programa_7(row.get("SIGLA_CURS")),
                "d_adimissa": parse_mdb_date(row.get("D_ADIMISSA")),
            }
        )

    matrix: Counter[tuple[str, str]] = Counter()

    students_with_m = 0
    students_with_d = 0
    students_with_both = 0
    students_outros_m_missing = 0
    students_outros_m_nonrecognized = 0
    students_outros_d_missing = 0
    students_outros_d_nonrecognized = 0
    students_only_m = 0
    students_only_d = 0

    for levels in students.values():
        m_entries = levels["Mestrado"]
        d_entries = levels["Doutorado"]

        has_m = bool(m_entries)
        has_d = bool(d_entries)

        if has_m:
            students_with_m += 1
        if has_d:
            students_with_d += 1
        if has_m and has_d:
            students_with_both += 1
        if has_m and not has_d:
            students_only_m += 1
        if has_d and not has_m:
            students_only_d += 1

        m_program = choose_level_program(m_entries)
        d_program = choose_level_program(d_entries)

        m_cat = m_program if m_program is not None else OUTROS
        d_cat = d_program if d_program is not None else OUTROS
        matrix[(m_cat, d_cat)] += 1

        if m_cat == OUTROS:
            if not has_m:
                students_outros_m_missing += 1
            else:
                students_outros_m_nonrecognized += 1
        if d_cat == OUTROS:
            if not has_d:
                students_outros_d_missing += 1
            else:
                students_outros_d_nonrecognized += 1

    log = {
        "curso_al_records_total": len(rows),
        "records_skipped_invalid_reg_aluno": skipped_invalid_reg,
        "records_skipped_non_mestrado_doutorado": skipped_non_md_level,
        "records_skipped_without_cic": skipped_without_cic,
        "students_with_any_md": len(students),
        "students_with_mestrado": students_with_m,
        "students_with_doutorado": students_with_d,
        "students_with_mestrado_e_doutorado": students_with_both,
        "students_only_mestrado": students_only_m,
        "students_only_doutorado": students_only_d,
        "students_row_outros_missing_mestrado": students_outros_m_missing,
        "students_row_outros_nonrecognized_mestrado": students_outros_m_nonrecognized,
        "students_col_outros_missing_doutorado": students_outros_d_missing,
        "students_col_outros_nonrecognized_doutorado": students_outros_d_nonrecognized,
    }
    return dict(matrix), log


def matrix_table(matrix: dict[tuple[str, str], int]) -> list[list[int]]:
    table: list[list[int]] = []
    for row_cat in CATEGORY_ORDER:
        row = [matrix.get((row_cat, col_cat), 0) for col_cat in CATEGORY_ORDER]
        table.append(row)
    return table


def write_csv_matrix(path: Path, matrix: dict[tuple[str, str], int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["mestrado\\doutorado", *CATEGORY_ORDER, "Total"])
        for row_cat in CATEGORY_ORDER:
            row_values = [matrix.get((row_cat, col_cat), 0) for col_cat in CATEGORY_ORDER]
            writer.writerow([row_cat, *row_values, sum(row_values)])

        col_totals = [
            sum(matrix.get((row_cat, col_cat), 0) for row_cat in CATEGORY_ORDER)
            for col_cat in CATEGORY_ORDER
        ]
        writer.writerow(["Total", *col_totals, sum(col_totals)])


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build transition matrix Mestrado->Doutorado by CIC "
            "for seven programs plus 'Outros'."
        )
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
        default=Path("Data/transicao_cic_mestrado_doutorado.json"),
        help="Output JSON path for transition matrix.",
    )
    parser.add_argument(
        "--csv-output",
        type=Path,
        default=Path("Data/transicao_cic_mestrado_doutorado.csv"),
        help="Output CSV path for transition matrix.",
    )
    parser.add_argument(
        "--log-output",
        type=Path,
        default=Path("Data/logs/transicao_cic_mestrado_doutorado_log.json"),
        help="Output JSON path for extraction log.",
    )
    args = parser.parse_args()

    mdb_path = args.mdb if args.mdb else find_latest_mdb(args.raw_dir)
    if not mdb_path.exists():
        raise FileNotFoundError(f"MDB file not found: {mdb_path}")

    reg_to_cic, gdr_log = build_reg_to_cic(mdb_path)
    matrix, transition_log = build_transition(mdb_path, reg_to_cic)
    now = datetime.now(timezone.utc).isoformat()

    table = matrix_table(matrix)
    row_totals = [sum(row) for row in table]
    col_totals = [sum(table[r][c] for r in range(len(CATEGORY_ORDER))) for c in range(len(CATEGORY_ORDER))]

    payload = {
        "generated_at_utc": now,
        "source_file": str(mdb_path),
        "id_strategy": {
            "primary": "GDRPESS.CIC (apenas dígitos)",
            "strict_cic_required": True,
            "notes": (
                "Sem fallback para REG_ALUNO na matriz; "
                "registros sem CIC são excluídos."
            ),
        },
        "categories": CATEGORY_ORDER,
        "matrix_rows_mestrado_cols_doutorado": table,
        "row_totals": row_totals,
        "col_totals": col_totals,
        "grand_total": sum(row_totals),
        "matrix_long": [
            {
                "mestrado": row_cat,
                "doutorado": col_cat,
                "count": matrix.get((row_cat, col_cat), 0),
            }
            for row_cat in CATEGORY_ORDER
            for col_cat in CATEGORY_ORDER
        ],
    }

    log_payload = {
        "generated_at_utc": now,
        "source_file": str(mdb_path),
        "categories": CATEGORY_ORDER,
        "gdrpess": gdr_log,
        "transition": transition_log,
        "output_json": str(args.output),
        "output_csv": str(args.csv_output),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.log_output.parent.mkdir(parents=True, exist_ok=True)

    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.log_output.write_text(
        json.dumps(log_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    write_csv_matrix(args.csv_output, matrix)

    print(f"Matriz JSON escrita em: {args.output}")
    print(f"Matriz CSV escrita em: {args.csv_output}")
    print(f"Log de extração em: {args.log_output}")
    print(
        "Resumo: "
        f"{transition_log['students_with_any_md']} alunos com CIC e nível M/D; "
        f"total da matriz = {sum(row_totals)}."
    )


if __name__ == "__main__":
    main()
