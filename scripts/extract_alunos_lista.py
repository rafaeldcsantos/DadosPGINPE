#!/usr/bin/env python3
"""Build consolidated student list from CURSO_AL joined with GDRPESS."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional


REG_FORMAT_RE = re.compile(r"^\d+/\d{4}$")
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

    formatted = f"{digits[:-4]}/{digits[-4:]}"
    if not REG_FORMAT_RE.fullmatch(formatted):
        return None
    return formatted


def parse_mdb_date(raw: Optional[str]) -> Optional[datetime]:
    text = clean_text(raw)
    if not text:
        return None
    for fmt in MDB_DATETIME_FORMATS:
        try:
            dt = datetime.strptime(text, fmt)
            # MDB exporta ano com 2 dígitos; evita datas no futuro.
            if dt.year > datetime.now().year:
                dt = dt.replace(year=dt.year - 100)
            return dt
        except ValueError:
            continue
    return None


def parse_mdb_date_iso(raw: Optional[str]) -> Optional[str]:
    dt = parse_mdb_date(raw)
    if dt is None:
        return None
    return dt.date().isoformat()


def get_first_row_value(row: dict, keys: list[str]) -> Optional[str]:
    for key in keys:
        if key in row:
            return row.get(key)
    return None


def normalize_sexo(raw: Optional[str]) -> str:
    text = clean_text(raw)
    if text == "Feminino":
        return "Feminino"
    if text in {"Masculino", "Maculino"}:
        return "Masculino"
    return "Não Informado"


def normalize_nacionalidade(raw: Optional[str]) -> str:
    text = clean_text(raw)
    if text in {"Brasileira", "Brasilera", "Brasileiro"}:
        return "Brasileira"
    if text in {"Estrangeira", "Estrangeiro"}:
        return "Estrangeira"
    return "Não Informada"


def normalize_nivel_cursoal(raw: Optional[str]) -> Optional[str]:
    text = clean_text(raw)
    if text is None:
        return None
    if text.upper() == "ISOLADO":
        return "Isolado"
    return text


PROGRAM_CODES = [
    "ISO",
    "PGAST",
    "PGCAP",
    "PGCST",
    "PGMET",
    "PGETE",
    "PGGES",
    "PGSER",
]


PROGRAM_NAMES = {
    "PGAST": "Astrofísica",
    "PGCAP": "Computação Aplicada",
    "PGCST": "Ciência do Sistema Terrestre",
    "PGETE": "Engenharia e Tecnologia Espaciais",
    "PGGES": "Geofísica Espacial",
    "PGMET": "Meteorologia",
    "PGSER": "Sensoriamento Remoto",
}


def normalize_programa(raw_sigla: Optional[str]) -> Optional[str]:
    sigla = clean_text(raw_sigla)
    if not sigla:
        return None

    code = sigla.upper()

    if code.startswith("ISO"):
        return "ISO"
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


def build_gdrpess_index(mdb_path: Path) -> tuple[dict[str, dict], dict]:
    rows = export_table_rows(mdb_path, "GDRPESS")
    index: dict[str, dict] = {}

    invalid_reg = 0
    duplicates = 0
    with_nome = 0

    for row in rows:
        reg = normalize_reg_aluno(row.get("REG_ALUNO"))
        if not reg:
            invalid_reg += 1
            continue

        person = {
            "nome": clean_text(row.get("NOME")),
            "nascimento": parse_mdb_date_iso(row.get("NASCIMENTO")),
            "nacionalidade": normalize_nacionalidade(row.get("NACIONALIDADE")),
            "sexo": normalize_sexo(row.get("SEXO")),
            "estado": clean_text(row.get("ESTADO")),
        }

        if person["nome"]:
            with_nome += 1

        if reg in index:
            duplicates += 1
            current = index[reg]
            # Mantém o registro com nome quando houver conflito.
            if not current.get("nome") and person.get("nome"):
                index[reg] = person
            continue

        index[reg] = person

    log = {
        "records_total": len(rows),
        "records_with_valid_reg_aluno": len(rows) - invalid_reg,
        "records_with_nome": with_nome,
        "records_skipped_reg_aluno_invalido": invalid_reg,
        "duplicate_reg_aluno": duplicates,
        "indexed_unique_reg_aluno": len(index),
    }
    return index, log


def build_alunos_lista(mdb_path: Path, gdr_index: dict[str, dict]) -> tuple[list[dict], dict]:
    rows = export_table_rows(mdb_path, "CURSO_AL")
    result: list[dict] = []

    skipped_invalid_reg = 0
    skipped_sigla_curs_vazio = 0
    skipped_status_vazio = 0
    skipped_d_adimissa_vazio = 0
    skipped_d_adimissa_parse = 0
    skipped_nivel_vazio = 0
    skipped_programa_nao_reconhecido = 0
    duplicate_reg = 0
    seen_reg: set[str] = set()
    joined_with_gdr = 0
    joined_without_gdr = 0
    skipped_by_raw_program: dict[str, int] = {}
    records_by_program: dict[str, int] = {}
    records_with_d_final = 0
    records_with_d_situacao = 0
    records_with_data_conclusao = 0

    for row in rows:
        reg = normalize_reg_aluno(row.get("REG_ALUNO"))
        if not reg:
            skipped_invalid_reg += 1
            continue

        if reg in seen_reg:
            duplicate_reg += 1
            continue
        seen_reg.add(reg)

        sigla_curs_raw = clean_text(row.get("SIGLA_CURS"))
        status = clean_text(row.get("STATUS"))
        d_adimissa_raw = clean_text(row.get("D_ADIMISSA"))
        d_final_raw = clean_text(row.get("D_FINAL"))
        d_situacao_raw = clean_text(
            get_first_row_value(
                row,
                [
                    "D_SITUAÇÃO",
                    "D_SITUÇÃO",
                    "D_SITUACAO",
                ],
            )
        )
        nivel_cursoal = normalize_nivel_cursoal(row.get("NIVEL"))

        if not sigla_curs_raw:
            skipped_sigla_curs_vazio += 1
            continue
        if not status:
            skipped_status_vazio += 1
            continue
        if not d_adimissa_raw:
            skipped_d_adimissa_vazio += 1
            continue

        d_adimissa_iso = parse_mdb_date_iso(d_adimissa_raw)
        if d_adimissa_iso is None:
            skipped_d_adimissa_parse += 1
            continue

        d_final_iso = parse_mdb_date_iso(d_final_raw)
        d_situacao_iso = parse_mdb_date_iso(d_situacao_raw)

        if d_final_iso:
            records_with_d_final += 1
        if d_situacao_iso:
            records_with_d_situacao += 1
        if d_final_iso or d_situacao_iso:
            records_with_data_conclusao += 1

        if nivel_cursoal is None:
            skipped_nivel_vazio += 1
            continue

        program_code = normalize_programa(sigla_curs_raw)
        if program_code is None:
            skipped_programa_nao_reconhecido += 1
            skipped_by_raw_program[sigla_curs_raw] = (
                skipped_by_raw_program.get(sigla_curs_raw, 0) + 1
            )
            continue

        records_by_program[program_code] = records_by_program.get(program_code, 0) + 1

        person = gdr_index.get(reg)
        if person is None:
            joined_without_gdr += 1
            person = {
                "nome": None,
                "nascimento": None,
                "nacionalidade": "Não Informada",
                "sexo": "Não Informado",
                "estado": None,
            }
        else:
            joined_with_gdr += 1

        result.append(
            {
                "reg_aluno": reg,
                "sigla_curs_original": sigla_curs_raw,
                "sigla_curs": program_code,
                "programa_nome": PROGRAM_NAMES.get(program_code),
                "status": status,
                "d_adimissa": d_adimissa_iso,
                "d_final": d_final_iso,
                "d_situacao": d_situacao_iso,
                "nivel_cursoal": nivel_cursoal,
                "nome": person.get("nome"),
                "nascimento": person.get("nascimento"),
                "nacionalidade": person.get("nacionalidade"),
                "sexo": person.get("sexo"),
                "estado": person.get("estado"),
            }
        )

    log = {
        "records_total": len(rows),
        "records_imported_success": len(result),
        "records_skipped_reg_aluno_invalido": skipped_invalid_reg,
        "records_skipped_sigla_curs_vazio": skipped_sigla_curs_vazio,
        "records_skipped_status_vazio": skipped_status_vazio,
        "records_skipped_d_adimissa_vazio": skipped_d_adimissa_vazio,
        "records_skipped_d_adimissa_invalida": skipped_d_adimissa_parse,
        "records_skipped_nivel_vazio": skipped_nivel_vazio,
        "records_skipped_programa_nao_reconhecido": skipped_programa_nao_reconhecido,
        "records_skipped_by_raw_program": dict(
            sorted(skipped_by_raw_program.items(), key=lambda kv: kv[0])
        ),
        "records_by_programa_normalizado": dict(
            sorted(records_by_program.items(), key=lambda kv: kv[0])
        ),
        "records_with_d_final": records_with_d_final,
        "records_with_d_situacao": records_with_d_situacao,
        "records_with_any_data_conclusao": records_with_data_conclusao,
        "duplicate_reg_aluno": duplicate_reg,
        "records_joined_with_gdrpess": joined_with_gdr,
        "records_joined_without_gdrpess": joined_without_gdr,
    }
    return result, log


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build student list from CURSO_AL with mandatory fields "
            "(SIGLA_CURS, STATUS, D_ADIMISSA, NIVEL), joined with GDRPESS."
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
        default=Path("Data/alunos_lista.json"),
        help="Output JSON path for consolidated student list.",
    )
    parser.add_argument(
        "--log-output",
        type=Path,
        default=Path("Data/logs/alunos_lista_extract_log.json"),
        help="Output JSON path for extraction log.",
    )
    args = parser.parse_args()

    mdb_path = args.mdb if args.mdb else find_latest_mdb(args.raw_dir)
    if not mdb_path.exists():
        raise FileNotFoundError(f"MDB file not found: {mdb_path}")

    gdr_index, gdr_log = build_gdrpess_index(mdb_path)
    alunos_rows, curso_log = build_alunos_lista(mdb_path, gdr_index)
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "generated_at_utc": now,
        "source_file": str(mdb_path),
        "base_table": "CURSO_AL",
        "join_table": "GDRPESS",
        "required_fields": ["SIGLA_CURS", "STATUS", "D_ADIMISSA", "NIVEL"],
        "recognized_program_codes": PROGRAM_CODES,
        "fields": [
            "reg_aluno",
            "sigla_curs_original",
            "sigla_curs",
            "programa_nome",
            "status",
            "d_adimissa",
            "d_final",
            "d_situacao",
            "nivel_cursoal",
            "nome",
            "nascimento",
            "nacionalidade",
            "sexo",
            "estado",
        ],
        "record_count": len(alunos_rows),
        "records": alunos_rows,
    }

    log_payload = {
        "generated_at_utc": now,
        "source_file": str(mdb_path),
        "base_table": "CURSO_AL",
        "join_table": "GDRPESS",
        "required_fields": ["SIGLA_CURS", "STATUS", "D_ADIMISSA", "NIVEL"],
        "recognized_program_codes": PROGRAM_CODES,
        "curso_al": curso_log,
        "gdrpess": gdr_log,
        "output_file": str(args.output),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.log_output.parent.mkdir(parents=True, exist_ok=True)

    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.log_output.write_text(
        json.dumps(log_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Dados exportados para: {args.output}")
    print(f"Log de extração em: {args.log_output}")
    print(
        "Resumo: "
        f"{curso_log['records_imported_success']} importados com sucesso "
        f"de {curso_log['records_total']} registros em CURSO_AL."
    )


if __name__ == "__main__":
    main()
