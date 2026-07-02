import json
from pathlib import Path
import argparse


# ===== CONFIG =====
DEFAULT_INPUT_FILES = [
    Path(__file__).resolve().parent / "verbs" / "1-basic.json",
    Path(__file__).resolve().parent / "verbs" / "2-intermediate.json",
    Path(__file__).resolve().parent / "verbs" / "3-advanced.json",
]
DEFAULT_OUTPUT_FILE = Path(__file__).resolve().parent / "verbs" / "verbs_all_levels.txt"
# ==================


def write_record(fp, item, level_name, idx):
    name = item.get("name", "") if isinstance(item, dict) else ""
    group_name = item.get("group_name", "") if isinstance(item, dict) else ""
    definitions = item.get("definitions", []) if isinstance(item, dict) else []

    meanings = []
    if isinstance(definitions, list):
        for definition in definitions:
            if isinstance(definition, dict):
                meaning = definition.get("meaning", "")
                if meaning:
                    meanings.append(meaning)

    fp.write(f"Nivel: {level_name}\n")
    fp.write(f"Registro {idx}\n")
    fp.write(f"  name: {name}\n")
    fp.write(f"  group_name: {group_name}\n")
    fp.write("  meaning:\n")
    for meaning in meanings:
        fp.write(f"    - {meaning}\n")
    fp.write("\n")


def main():
    parser = argparse.ArgumentParser(description="Inspect basic verbs JSON data.")
    parser.add_argument(
        "--input",
        action="append",
        help="Ruta a uno o más archivos JSON. Si no se pasa, usa los 3 archivos de verbs.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_FILE),
        help="Ruta del archivo .txt de salida. Por defecto usa verbs/verbs_all_levels.txt.",
    )
    args = parser.parse_args()

    input_paths = [Path(p) for p in args.input] if args.input else DEFAULT_INPUT_FILES
    output_path = Path(args.output)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as out_fp:
        for input_path in input_paths:
            if not input_path.exists():
                out_fp.write(f"ERROR: No existe el archivo: {input_path}\n\n")
                continue

            level_name = input_path.stem

            with open(input_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if not isinstance(data, list):
                out_fp.write(f"ERROR: El JSON raíz debe ser una lista en {input_path}\n\n")
                continue

            out_fp.write(f"ARCHIVO: {input_path}\n\n")

            for idx, item in enumerate(data):
                write_record(out_fp, item, level_name, idx)

    print(f"Guardado en: {output_path}")


if __name__ == "__main__":
    main()
