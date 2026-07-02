import argparse
import json
from collections import Counter
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT_FILE = BASE_DIR / "verbs" / "verbs_all_levels.txt"
DEFAULT_OUTPUT_FILE = BASE_DIR / "verbs" / "verbs_semantic_classification.json"
MIN_THEME_SIZE = 8

BASIC_VERBS = {
    "be", "have", "do", "say", "get", "make", "go", "know", "take", "see",
    "think", "come", "give", "want", "tell", "put", "mean", "feel", "call",
    "ask", "help", "show", "hear", "run", "move", "live", "talk", "write",
    "read", "walk", "eat", "drink", "sleep", "buy",
    "work",
}

ESSENTIAL_VERBS = {
    "be", "have", "do", "go", "come", "get", "give", "take", "need", "want",
    "help", "call", "ask", "say", "tell", "see", "hear", "find", "feel",
    "eat", "drink", "sleep", "buy", "pay", "enter", "leave", "stop", "sit",
    "stand", "live",
}

ADVANCED_VERBS = {
    "achieve", "analyze", "evaluate", "interpret", "assume", "comprehend",
    "emphasize", "elaborate", "clarify", "assert", "imply", "convey",
    "implement", "facilitate", "enhance", "modify", "establish", "influence",
    "persuade", "adapt", "alter", "acquire", "resolve", "overcome",
    "encounter", "perceive", "demonstrate", "anticipate", "investigate",
    "maintain", "justify", "infer", "regard", "advocate", "negotiate",
    "consult", "propose", "criticize", "prioritize", "delegate", "launch",
    "transform", "diminish", "escalate", "fluctuate", "undermine",
    "reinforce", "comply", "collaborate", "coordinate", "mediate",
    "allocate", "execute", "strategize", "benchmark", "outsource",
    "streamline", "audit",
}

THEME_MAP = {
    "being_state": {
        "be", "seem", "remain", "become", "happen", "appear", "live",
    },
    "movement": {
        "go", "come", "move", "walk", "run", "travel", "arrive", "return",
        "reach", "leave", "follow", "pass", "fall", "fly", "swim", "drive",
        "turn", "avoid", "sit", "stand",
    },
    "communication": {
        "say", "tell", "call", "ask", "show", "talk", "write", "read",
        "speak", "explain", "describe", "report", "mention", "order",
        "discuss", "suggest", "promise", "emphasize", "elaborate",
        "clarify", "assert", "imply", "convey", "propose", "justify",
        "criticize", "advocate", "persuade", "demonstrate",
    },
    "thinking": {
        "know", "think", "mean", "believe", "learn", "remember", "consider",
        "expect", "decide", "understand", "choose", "forget", "realize",
        "guess", "wonder", "recognize", "doubt", "plan", "analyze",
        "evaluate", "interpret", "assume", "comprehend", "anticipate",
        "investigate", "infer", "regard", "perceive",
    },
    "action": {
        "want", "need", "try", "play", "wait", "wear", "eat",
        "drink", "sleep", "clean", "cook", "wash", "shop", "search",
        "join", "catch", "throw", "use", "let", "do", "make",
        "pull", "push", "bring", "carry", "win", "lose", "argue",
        "resolve", "overcome", "fight", "solve", "escalate", "negotiate",
    },
    "placing": {
        "put", "set", "add", "place", "install",
    },
    "creation": {
        "create", "build", "develop", "form", "add", "grow", "establish",
        "launch", "transform", "modify", "adapt", "alter", "change",
        "raise", "set",
    },
    "repair": {
        "fix", "repair", "improve", "enhance", "maintain", "clean",
        "resolve", "support", "reinforce", "facilitate",
    },
    "damage": {
        "break", "cut", "damage", "kill", "die", "lose", "diminish",
        "undermine", "destroy", "hurt",
    },
    "work": {
        "work", "manage", "control", "implement", "consult",
        "prioritize", "delegate", "comply", "collaborate", "coordinate",
        "mediate", "allocate", "execute", "strategize", "benchmark",
        "outsource", "streamline", "audit", "hire", "fire", "employ",
        "provide", "represent", "cost", "serve",
    },
    "health": {
        "heal", "recover", "treat", "cure",
        "sleep", "eat", "drink", "die",
    },
    "process": {
        "begin", "start", "stop", "continue", "finish", "end", "pause",
        "remain", "become", "happen", "appear", "seem",
    },
    "perception": {
        "see", "find", "hear", "watch", "look", "listen", "recognize",
        "perceive", "encounter",
    },
    "possession_exchange": {
        "have", "get", "take", "give", "hold", "pay", "send",
        "sell", "offer", "buy", "share", "acquire",
        "spend", "keep",
    },
    "feelings": {
        "hope", "wish", "agree", "enjoy", "prefer", "feel",
        "like", "want", "love", "hate",
    },
}

THEME_REASON = {
    "being_state": "Accion o estado de ser, estar, parecer o seguir igual.",
    "movement": "Accion fisica visible de moverse o cambiar de lugar.",
    "communication": "Accion de decir, preguntar, escribir o explicar.",
    "thinking": "Accion mental: saber, decidir, recordar o analizar.",
    "action": "Accion comun que se hace con el cuerpo o en la rutina.",
    "placing": "Accion de poner, agregar, fijar o colocar algo en un sitio.",
    "creation": "Accion de crear, construir, agregar o cambiar algo.",
    "repair": "Accion de reparar, mejorar o mantener algo.",
    "damage": "Accion de romper, cortar, perder o danar.",
    "work": "Accion relacionada con empleo, oficina o tareas laborales.",
    "health": "Accion o estado ligado al cuerpo, salud o bienestar.",
    "process": "Accion de empezar, parar, seguir o terminar.",
    "perception": "Accion de ver, oir, mirar o notar algo.",
    "possession_exchange": "Accion de tener, dar, recibir, comprar, pagar o vender.",
    "feelings": "Accion o estado de gusto, deseo, emocion o vida personal.",
}

MEANING_THEME_KEYWORDS = [
    ("work", ["trabajar", "empleo", "oficina", "gestionar", "administrar", "laboral", "contratar", "despedir"]),
    ("placing", ["poner", "colocar", "agregar", "anadir", "añadir", "sumar", "fijar", "establecer"]),
    ("repair", ["arreglar", "reparar", "mejorar", "mantener", "reforzar"]),
    ("damage", ["romper", "quebrar", "cortar", "dañar", "danar", "perder", "morir", "destruir"]),
    ("movement", ["ir", "venir", "caminar", "correr", "moverse", "llegar", "salir", "entrar", "volver", "caer"]),
    ("communication", ["decir", "preguntar", "hablar", "explicar", "describir", "escribir", "leer", "contar", "afirmar"]),
    ("thinking", ["pensar", "saber", "creer", "recordar", "considerar", "entender", "decidir", "analizar", "interpretar"]),
    ("perception", ["ver", "oir", "oir", "escuchar", "mirar", "percibir", "observar"]),
    ("possession_exchange", ["tener", "obtener", "recibir", "dar", "comprar", "vender", "pagar", "compartir", "enviar"]),
    ("being_state", ["ser", "estar", "parecer", "seguir", "convertirse"]),
    ("feelings", ["sentir", "gustar", "querer", "esperar", "preferir", "disfrutar", "amar", "odiar"]),
    ("health", ["curar", "sanar", "recuperar", "tratar", "enfermo", "salud", "saludable", "gripe"]),
    ("process", ["empezar", "comenzar", "iniciar", "parar", "detener", "continuar", "terminar"]),
    ("creation", ["crear", "construir", "desarrollar", "formar", "transformar", "modificar"]),
]

THEME_MERGE_TARGET = {
    "placing": "action",
    "process": "action",
    "damage": "action",
    "repair": "action",
    "perception": "thinking",
    "being_state": "feelings",
    "health": "feelings",
}

LEVEL_THEME_MERGE_TARGET = {
    ("creation", "1-basic"): "action",
    ("work", "1-basic"): "action",
}

MIN_LEVEL_THEME_SIZE = 3


def parse_summary(text):
    entries = []
    current = None
    in_meanings = False

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if not stripped or stripped.startswith("ARCHIVO:"):
            continue

        if stripped.startswith("Nivel: "):
            if current:
                entries.append(current)
            current = {
                "original_level": stripped.split(": ", 1)[1],
                "meanings": [],
            }
            in_meanings = False
            continue

        if current is None:
            continue

        if stripped.startswith("Registro "):
            current["registro"] = int(stripped.split(" ", 1)[1])
        elif stripped.startswith("name: "):
            current["name"] = stripped.split(": ", 1)[1]
        elif stripped.startswith("group_name: "):
            current["original_group_name"] = stripped.split(": ", 1)[1]
        elif stripped == "meaning:":
            in_meanings = True
        elif in_meanings and stripped.startswith("- "):
            current["meanings"].append(stripped[2:])
        else:
            in_meanings = False

    if current:
        entries.append(current)

    return entries


def infer_theme(name, original_group, main_meaning):
    meaning_lower = main_meaning.lower()

    if name == "stay":
        return "being_state", "high"
    if name == "visit":
        return "movement", "high"
    if name == "meet":
        return "communication", "high"
    if name in {"allow", "require", "include"}:
        return "action", "high"
    if name in {"provide", "serve"}:
        return "work", "high"

    for theme, verbs in THEME_MAP.items():
        if name in verbs:
            return theme, "high"

    group_lower = original_group.lower()

    for theme, keywords in MEANING_THEME_KEYWORDS:
        if any(keyword in meaning_lower for keyword in keywords):
            return theme, "high"

    if any(token in group_lower for token in ["communication", "academic"]):
        return "communication", "low"
    if any(token in group_lower for token in ["thinking", "critical"]):
        return "thinking", "low"
    if any(token in group_lower for token in ["business", "professional"]):
        return "work", "low"
    if any(token in group_lower for token in ["control", "managing"]):
        return "work", "low"
    if any(token in group_lower for token in ["creating", "change", "building"]):
        return "creation", "low"
    if any(token in group_lower for token in ["movement", "body"]):
        return "movement", "low"
    if any(token in group_lower for token in ["feeling", "state"]):
        return "being_state", "low"
    if any(token in group_lower for token in ["social", "exchange"]):
        return "possession_exchange", "low"
    if any(token in meaning_lower for token in ["ver", "oir", "escuchar", "percibir"]):
        return "perception", "low"

    return "action", "low"


def infer_level(name, original_level, theme):
    if name in ESSENTIAL_VERBS:
        return "1-basic"
    if name in ADVANCED_VERBS or theme in {"thinking", "communication", "work"} and original_level == "3-advanced":
        return "3-advanced"
    if name in BASIC_VERBS:
        return "1-basic"
    if original_level == "3-advanced" and theme in {"thinking", "creation"}:
        return "3-advanced"
    if original_level == "1-basic" and name not in BASIC_VERBS and theme in {"thinking", "communication", "work"}:
        return "2-intermediate"
    return "2-intermediate" if original_level == "2-intermediate" else original_level


def build_reason(theme, level, original_level, confidence):
    reason = THEME_REASON[theme]
    if level != original_level:
        return f"{reason[:-1]}; se reubica por frecuencia y utilidad."
    if confidence == "low":
        return f"{reason[:-1]}; clasificacion aproximada por contexto."
    return reason


def infer_essential(name, suggested_level):
    return name in ESSENTIAL_VERBS


def transform_entries(entries):
    output = []

    for entry in entries:
        name = entry.get("name", "")
        original_level = entry.get("original_level", "")
        original_group_name = entry.get("original_group_name", "")
        meanings = entry.get("meanings", [])
        main_meaning = meanings[0] if meanings else ""

        theme, confidence = infer_theme(name, original_group_name, main_meaning)
        suggested_level = infer_level(name, original_level, theme)

        output.append(
            {
                "registro": entry["registro"],
                "name": name,
                "original_level": original_level,
                "original_group_name": original_group_name,
                "main_meaning": main_meaning,
                "suggested_level": suggested_level,
                "suggested_theme": theme,
                "suggested_file": f"verbs/{suggested_level}/{theme}.json",
                "is_essential": infer_essential(name, suggested_level),
                "confidence": confidence,
                "reason": build_reason(theme, suggested_level, original_level, confidence),
            }
        )

    return output


def merge_small_themes(items):
    counts = Counter(item["suggested_theme"] for item in items)

    for item in items:
        theme = item["suggested_theme"]
        if counts[theme] >= MIN_THEME_SIZE:
            continue

        merge_target = THEME_MERGE_TARGET.get(theme)
        if not merge_target:
            continue

        item["suggested_theme"] = merge_target
        item["suggested_file"] = f"verbs/{item['suggested_level']}/{merge_target}.json"
        item["reason"] = f"{item['reason']} Categoria fusionada para evitar grupos muy pequenos."

    return items


def merge_small_level_themes(items):
    counts = Counter((item["suggested_theme"], item["suggested_level"]) for item in items)

    for item in items:
        key = (item["suggested_theme"], item["suggested_level"])
        if counts[key] >= MIN_LEVEL_THEME_SIZE:
            continue

        merge_target = LEVEL_THEME_MERGE_TARGET.get(key)
        if not merge_target:
            continue

        item["suggested_theme"] = merge_target
        item["suggested_file"] = f"verbs/{item['suggested_level']}/{merge_target}.json"
        item["reason"] = f"{item['reason']} En nivel basico se fusiona con una categoria mas util para supervivencia diaria."

    return items


def main():
    parser = argparse.ArgumentParser(description="Clasifica verbos desde un resumen TXT.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT_FILE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_FILE))
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    entries = parse_summary(input_path.read_text(encoding="utf-8"))
    classified = transform_entries(entries)
    classified = merge_small_themes(classified)
    classified = merge_small_level_themes(classified)

    output_path.write_text(
        json.dumps(classified, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Entradas: {len(classified)}")
    print(f"Guardado en: {output_path}")


if __name__ == "__main__":
    main()
