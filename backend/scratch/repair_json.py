import json
import os
import subprocess

# 1. Load the JSON
with open('1-basic.json', 'r') as f:
    cards = json.load(f)

# 2. Get the list of files from GCS
print("📦 Listing GCS files...")
bucket_path = "gs://theruby-assets/card_images/pronouns/1-basic/"
result = subprocess.run(['gsutil', 'ls', bucket_path], capture_output=True, text=True)
gcs_files = result.stdout.splitlines()

# 3. Create a map for quick lookup
gcs_map = {}
for file_url in gcs_files:
    filename = file_url.split('/')[-1]
    gcs_map[filename] = file_url.replace('gs://', 'https://storage.googleapis.com/')

# 4. Iterate and Repair
prefix = "1-basic"
updated_count = 0

for card_idx, card in enumerate(cards):
    for def_idx, definition in enumerate(card.get('definitions', [])):
        # Pattern: {prefix}_card_{card_idx}_def{def_idx}
        base_name = f"{prefix}_card_{card_idx}_def{def_idx}"
        
        # Check for jpg or png
        found_url = None
        for ext in ['.png', '.jpg']:
            key = base_name + ext
            if key in gcs_map:
                found_url = gcs_map[key]
                break # Favor PNG if both exist? No, ext order defines priority
        
        if found_url:
            current_path = definition.get('imagePath')
            if current_path != found_url:
                definition['imagePath'] = found_url
                print(f"✅ Linked: {card['name']} (Def {def_idx}) -> {found_url}")
                updated_count += 1

# 5. Save updated JSON
with open('1-basic_fixed.json', 'w') as f:
    json.dump(cards, f, indent=4, ensure_ascii=False)

print(f"🚀 Repair complete. Updated {updated_count} fields.")
