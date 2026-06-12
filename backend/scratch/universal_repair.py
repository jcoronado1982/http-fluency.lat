#!/usr/bin/env python3
"""
Enlaza imágenes existentes al JSON del deck.
Prioriza AVIF (formato optimizado canónico). Solo usa jpg/png si no hay AVIF.

Uso local (Oracle repo montado o LOCAL_STORAGE_PATH):
  REPO_ROOT=/home/jcoronado/Desktop/dev/flashcard python3 universal_repair.py

Uso remoto vía SSH (solo lectura local + escritura):
  REPO_ROOT=/root/smart-proxy/repository/flashcard python3 universal_repair.py
"""
import json
import os
import sys

REPO_ROOT = os.environ.get("REPO_ROOT", ".")
JSON_ROOT = os.path.join(REPO_ROOT, "json")
IMAGE_ROOT = os.path.join(REPO_ROOT, "card_images")
BACKUP_DIR = os.path.join(os.path.dirname(__file__), "backup_json")

CANONICAL_EXT = ".avif"
LEGACY_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def canonical_path(category: str, deck_name: str, base_pattern: str) -> str:
    return f"/card_images/{category}/{deck_name}/{base_pattern}{CANONICAL_EXT}"


def find_image_file(img_dir: str, base_pattern: str) -> str | None:
    """Devuelve el nombre de archivo real en disco, priorizando AVIF."""
    avif_name = base_pattern + CANONICAL_EXT
    if os.path.isfile(os.path.join(img_dir, avif_name)):
        return avif_name

    for ext in LEGACY_EXTS:
        name = base_pattern + ext
        if os.path.isfile(os.path.join(img_dir, name)):
            return name
    return None


def repair_all() -> None:
    if not os.path.isdir(JSON_ROOT):
        print(f"❌ No existe JSON_ROOT: {JSON_ROOT}")
        sys.exit(1)

    os.makedirs(BACKUP_DIR, exist_ok=True)
    print(f"📂 Repo: {REPO_ROOT}")

    categories = sorted(
        d for d in os.listdir(JSON_ROOT)
        if os.path.isdir(os.path.join(JSON_ROOT, d))
    )
    print(f"🔍 Categorías: {', '.join(categories)}")

    total_updates = 0

    for cat in categories:
        cat_dir = os.path.join(JSON_ROOT, cat)
        for deck_file in sorted(f for f in os.listdir(cat_dir) if f.endswith(".json")):
            deck_name = deck_file.replace(".json", "")
            json_path = os.path.join(cat_dir, deck_file)
            img_dir = os.path.join(IMAGE_ROOT, cat, deck_name)

            print(f"\n  📄 {cat}/{deck_file}")

            with open(json_path, encoding="utf-8") as f:
                data = json.load(f)

            if isinstance(data, list):
                cards = data
            elif isinstance(data, dict) and "flashcards" in data:
                cards = data["flashcards"]
            else:
                print("    ⚠️ Formato JSON desconocido")
                continue

            if not os.path.isdir(img_dir):
                print(f"    ℹ️ Sin directorio de imágenes: {img_dir}")
                continue

            updated = 0
            for card_idx, card in enumerate(cards):
                for def_idx, definition in enumerate(card.get("definitions", [])):
                    base = f"{deck_name}_card_{card_idx}_def{def_idx}"
                    found = find_image_file(img_dir, base)
                    if not found:
                        continue

                    # Siempre enlazar AVIF si existe; si no, el legacy real
                    if found.endswith(CANONICAL_EXT):
                        new_path = canonical_path(cat, deck_name, base)
                    else:
                        new_path = f"/card_images/{cat}/{deck_name}/{found}"
                        print(f"    ⚠️ Legacy sin AVIF: {found}")

                    if definition.get("imagePath") != new_path:
                        definition["imagePath"] = new_path
                        updated += 1

            if updated > 0:
                backup = os.path.join(BACKUP_DIR, f"{cat}_{deck_file}")
                with open(backup, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

                print(f"    ✅ {updated} imagePath → AVIF/legacy canónico")
                total_updates += updated
            else:
                print("    ✨ Sin cambios")

    print(f"\n✨ Total actualizaciones: {total_updates}")


if __name__ == "__main__":
    repair_all()
