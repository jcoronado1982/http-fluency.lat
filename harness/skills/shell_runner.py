import subprocess
import time
import os
import json

class ShellRunner:
    def __init__(self, guardrails_path):
        with open(guardrails_path, 'r') as f:
            self.guardrails = json.load(f)

    def is_safe(self, command: str, cwd: str) -> tuple[bool, str]:
        # Validar directorio
        cwd_abs = os.path.abspath(cwd)
        allowed = False
        for directory in self.guardrails["allowed_directories"]:
            if cwd_abs.startswith(os.path.abspath(directory)):
                allowed = True
                break
        if not allowed:
            return False, f"El directorio {cwd} no está dentro del área permitida."
        
        # Validar comandos prohibidos
        for forbidden in self.guardrails["forbidden_commands"]:
            if forbidden in command:
                return False, f"El comando contiene una palabra prohibida: '{forbidden}'"
        
        return True, ""

    def run(self, command: str, cwd: str) -> dict:
        is_safe, reason = self.is_safe(command, cwd)
        if not is_safe:
            return {
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": f"Guardrail Violation: {reason}",
                "duration_seconds": 0
            }
        
        timeout = self.guardrails.get("default_timeout_seconds", 90)
        start_time = time.time()
        
        try:
            process = subprocess.run(
                command,
                shell=True,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout
            )
            duration = time.time() - start_time
            return {
                "success": process.returncode == 0,
                "exit_code": process.returncode,
                "stdout": process.stdout,
                "stderr": process.stderr,
                "duration_seconds": round(duration, 3)
            }
        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            return {
                "success": False,
                "exit_code": -9,
                "stdout": "",
                "stderr": f"El comando excedió el tiempo límite de {timeout} segundos.",
                "duration_seconds": round(duration, 3)
            }
        except Exception as e:
            duration = time.time() - start_time
            return {
                "success": False,
                "exit_code": -99,
                "stdout": "",
                "stderr": str(e),
                "duration_seconds": round(duration, 3)
            }
