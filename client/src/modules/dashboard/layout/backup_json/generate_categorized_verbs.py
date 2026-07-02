import argparse
import json
from collections import defaultdict
from pathlib import Path
import shutil


BASE_DIR = Path(__file__).resolve().parent
VERBS_DIR = BASE_DIR / "verbs"
CLASSIFICATION_FILE = VERBS_DIR / "verbs_semantic_classification.json"

SOURCE_FILES = {
    "1-basic": VERBS_DIR / "1-basic.json",
    "2-intermediate": VERBS_DIR / "2-intermediate.json",
    "3-advanced": VERBS_DIR / "3-advanced.json",
}

TARGET_LEVEL_DIRS = [
    VERBS_DIR / "1-basic",
    VERBS_DIR / "2-intermediate",
    VERBS_DIR / "3-advanced",
]


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def clean_target_dirs():
    for level_dir in TARGET_LEVEL_DIRS:
        if level_dir.exists():
            shutil.rmtree(level_dir)
        level_dir.mkdir(parents=True, exist_ok=True)


def build_source_index():
    source_index = {}

    for level_name, path in SOURCE_FILES.items():
        data = load_json(path)
        if not isinstance(data, list):
            raise ValueError(f"El JSON raiz debe ser lista en {path}")

        for idx, item in enumerate(data):
            source_index[(level_name, idx)] = item

    return source_index


def group_records(classification, source_index):
    grouped = defaultdict(list)

    for entry in classification:
        level = entry["original_level"]
        registro = entry["registro"]
        target_file = BASE_DIR / entry["suggested_file"]
        key = (level, registro)

        if key not in source_index:
            raise KeyError(f"No se encontro origen para {key}")

        grouped[target_file].append(source_index[key])

    return grouped


def write_grouped_files(grouped):
    written = []

    for target_file, items in sorted(grouped.items()):
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", encoding="utf-8") as fh:
            json.dump(items, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        written.append((target_file, len(items)))

    return written


def main():
    parser = argparse.ArgumentParser(
        description="Genera archivos por categoria y nivel usando la clasificacion existente."
    )
    parser.add_argument(
        "--classification",
        default=str(CLASSIFICATION_FILE),
        help="Ruta al JSON de clasificacion.",
    )
    args = parser.parse_args()

    classification_path = Path(args.classification)
    classification = load_json(classification_path)
    if not isinstance(classification, list):
        raise ValueError(f"El JSON raiz debe ser lista en {classification_path}")

    clean_target_dirs()
    source_index = build_source_index()
    grouped = group_records(classification, source_index)
    written = write_grouped_files(grouped)

    total_records = sum(count for _, count in written)
    print(f"Archivos generados: {len(written)}")
    print(f"Registros distribuidos: {total_records}")
    for path, count in written:
        print(f"{path.relative_to(BASE_DIR)} -> {count}")


if __name__ == "__main__":
    main()
