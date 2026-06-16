import re

class LogParser:
    @staticmethod
    def parse_rust_errors(stderr: str) -> list[dict]:
        # Expresión regular para capturar errores de Rust
        # Ej. "error[E0432]: unresolved import..." seguido de " --> backend/src/main.rs:24:5"
        errors = []
        lines = stderr.split('\n')
        current_error = None
        
        for line in lines:
            if line.startswith("error[E") or line.startswith("error:"):
                if current_error:
                    errors.append(current_error)
                current_error = {
                    "message": line.strip(),
                    "location": None,
                    "details": []
                }
            elif current_error and line.strip().startswith("-->"):
                location_match = re.search(r'-->\s+([a-zA-Z0-9_\-\.\/]+):(\d+):(\d+)', line)
                if location_match:
                    current_error["location"] = {
                        "file": location_match.group(1),
                        "line": int(location_match.group(2)),
                        "column": int(location_match.group(3))
                    }
            elif current_error and line.strip():
                if len(current_error["details"]) < 5:
                    current_error["details"].append(line.strip())
        
        if current_error:
            errors.append(current_error)
            
        return errors

    @staticmethod
    def format_summary(stderr: str) -> str:
        rust_errors = LogParser.parse_rust_errors(stderr)
        if not rust_errors:
            # Si no hay errores estructurados de Rust, devuelve las últimas 15 líneas útiles de error
            lines = [l.strip() for l in stderr.split('\n') if l.strip()]
            last_lines = "\n".join(lines[-15:])
            return f"No se pudo estructurar el error automáticamente. Últimas líneas del log:\n{last_lines}"
        
        summary_parts = []
        for i, err in enumerate(rust_errors, 1):
            loc_str = "Ubicación desconocida"
            if err["location"]:
                loc = err["location"]
                loc_str = f"Archivo: {loc['file']} (Línea: {loc['line']}, Columna: {loc['column']})"
            
            details_str = "\n  ".join(err["details"])
            summary_parts.append(
                f"Error #{i}:\n"
                f"  Mensaje: {err['message']}\n"
                f"  Ubicación: {loc_str}\n"
                f"  Detalle:\n  {details_str}\n"
            )
            
        return "\n".join(summary_parts)
