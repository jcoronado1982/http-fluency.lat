import os
import sys
import argparse
from dotenv import load_dotenv

# Cargar variables de entorno desde backend/.env
load_dotenv("backend/.env")

# Validar que tengamos la API Key para conectar con Gemini
if not os.environ.get("GEMINI_API_KEY"):
    print("Error: GEMINI_API_KEY no encontrada en backend/.env o en las variables globales.")
    sys.exit(1)

from google import genai
from google.genai import types
from skills.file_operator import FileOperator
from skills.shell_runner import ShellRunner
from skills.log_parser import LogParser

# Directorio base del proyecto
WORKSPACE_DIR = "/home/jcoronado/Desktop/dev/flashcard"

# Inicializar operadores de infraestructura
file_op = FileOperator([WORKSPACE_DIR])
shell_run = ShellRunner(os.path.join(WORKSPACE_DIR, "harness/config/guardrails.json"))

# --- Definición de Herramientas (Tools) expuestas a la IA ---

def read_code_file(filepath: str, start_line: int = None, end_line: int = None) -> str:
    """Lee el contenido de un archivo de código del proyecto de forma controlada.

    Args:
        filepath: Ruta del archivo (ej. 'backend/src/main.rs').
        start_line: Línea inicial a leer (1-indexed, opcional).
        end_line: Línea final a leer (inclusive, opcional).
    """
    if not os.path.isabs(filepath):
        filepath = os.path.join(WORKSPACE_DIR, filepath)
    return file_op.read_file(filepath, start_line, end_line)

def apply_code_patch(filepath: str, target_content: str, replacement_content: str) -> str:
    """Aplica una modificación de código (parche) reemplazando un bloque de texto exacto.
    Solo funciona si hay una única coincidencia exacta en el archivo.

    Args:
        filepath: Ruta del archivo a modificar (ej. 'backend/src/main.rs').
        target_content: Texto exacto existente que se quiere reemplazar (debe incluir indentación).
        replacement_content: Texto nuevo con el que se reemplazará.
    """
    if not os.path.isabs(filepath):
        filepath = os.path.join(WORKSPACE_DIR, filepath)
    return file_op.apply_patch(filepath, target_content, replacement_content)

def run_compile_check() -> str:
    """Compila el backend en Rust para verificar si hay errores sintácticos o de tipos.
    Retorna 'Éxito: Cero errores de compilación' o un resumen limpio de los errores encontrados.
    """
    result = shell_run.run("cargo check --manifest-path backend/Cargo.toml", WORKSPACE_DIR)
    if result["success"]:
        return "Éxito: Cero errores de compilación."
    return LogParser.format_summary(result["stderr"] or result["stdout"])

def run_tests() -> str:
    """Ejecuta la suite de pruebas unitarias del backend Rust.
    Retorna el resultado de las pruebas.
    """
    result = shell_run.run("cargo test --manifest-path backend/Cargo.toml", WORKSPACE_DIR)
    if result["success"]:
        return f"Éxito: Todas las pruebas pasaron.\n{result['stdout']}"
    return f"Fallo en las pruebas:\n{result['stderr'] or result['stdout']}"

# Mapeo de nombres de herramientas a sus funciones reales para la ejecución en bucle
tools_map = {
    "read_code_file": read_code_file,
    "apply_code_patch": apply_code_patch,
    "run_compile_check": run_compile_check,
    "run_tests": run_tests
}

# --- Instrucciones de Comportamiento del Arnés ---
SYSTEM_INSTRUCTIONS = """
Eres el Agente Orquestador del Arnés de Desarrollo de Flashcard AI.
Tu objetivo es guiar la implementación de la tarea solicitada de forma segura y estructurada.

Sigue estas reglas estrictas:
1. Investiga el código usando `read_code_file` para entender la estructura antes de proponer cambios.
2. Aplica modificaciones pequeñas y localizadas usando `apply_code_patch`.
3. Inmediatamente después de cada cambio, ejecuta obligatoriamente `run_compile_check`.
4. Si hay errores de compilación, analízalos y aplica nuevos parches para corregirlos. Repite hasta que no haya errores de compilación.
5. Ejecuta `run_tests` para verificar la estabilidad de los cambios.
6. Reporta el éxito y un resumen detallado de los cambios realizados una vez que todas las pruebas y compilaciones pasen.
"""

def main():
    parser = argparse.ArgumentParser(description="Arnés de Desarrollo AI para Flashcard AI")
    parser.add_argument("--task", type=str, required=True, help="La tarea de desarrollo a realizar")
    args = parser.parse_args()

    client = genai.Client()
    
    print(f"🚀 Iniciando Arnés para la tarea: '{args.task}'\n")

    # Iniciar historial de la conversación
    messages = [
        types.Content(role="user", parts=[types.Part(text=args.task)])
    ]

    # Modelo y configuración
    model_name = "gemini-2.5-flash"
    config = types.GenerateContentConfig(
        tools=[read_code_file, apply_code_patch, run_compile_check, run_tests],
        system_instruction=SYSTEM_INSTRUCTIONS,
        temperature=0.0
    )

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=messages,
            config=config
        )
    except Exception as e:
        print(f"Error al conectar con la API de Gemini: {e}")
        sys.exit(1)

    while True:
        # Si la IA solicita ejecutar alguna herramienta (Function Calling)
        if response.function_calls:
            # Guardamos la llamada de la IA en el historial de la conversación
            messages.append(response.candidates[0].content)
            
            tool_responses_parts = []
            for call in response.function_calls:
                print(f"🛠️  [IA llama herramienta]: {call.name}({call.args})")
                
                # Ejecutar la función correspondiente
                func = tools_map.get(call.name)
                if func:
                    try:
                        args_dict = dict(call.args)
                        result = func(**args_dict)
                        print(f"🟢 [Resultado]: {str(result)[:120]}...")
                    except Exception as e:
                        result = f"Error al ejecutar: {e}"
                        print(f"🔴 [Error]: {result}")
                else:
                    result = f"Error: La herramienta {call.name} no existe."
                    print(f"🔴 [Error]: {result}")
                
                # Crear la respuesta estructurada de la herramienta
                part = types.Part(
                    function_response=types.FunctionResponse(
                        name=call.name,
                        response={"result": result}
                    )
                )
                tool_responses_parts.append(part)
            
            # Guardamos las respuestas de las herramientas en el historial
            messages.append(types.Content(role="tool", parts=tool_responses_parts))
            
            # Pedir a la IA su siguiente paso de razonamiento
            response = client.models.generate_content(
                model=model_name,
                contents=messages,
                config=config
            )
        else:
            # La IA no necesita más herramientas, imprime su respuesta final textual y salimos
            if response.text:
                print(f"\n🤖 [Respuesta Final de la IA]:\n{response.text}")
            break

    print("\n🏁 Proceso finalizado.")

if __name__ == "__main__":
    main()
