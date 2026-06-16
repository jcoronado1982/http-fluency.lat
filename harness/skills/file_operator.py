import os

class FileOperator:
    def __init__(self, allowed_directories):
        self.allowed_directories = [os.path.abspath(d) for d in allowed_directories]

    def _is_allowed_path(self, filepath: str) -> bool:
        abs_path = os.path.abspath(filepath)
        for directory in self.allowed_directories:
            if abs_path.startswith(directory):
                return True
        return False

    def read_file(self, filepath: str, start_line: int = None, end_line: int = None) -> str:
        if not self._is_allowed_path(filepath):
            return f"Error: Acceso denegado a la ruta {filepath}."
        
        if not os.path.exists(filepath):
            return f"Error: El archivo {filepath} no existe."

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            if start_line is not None and end_line is not None:
                # 1-indexed conversion
                sliced_lines = lines[start_line - 1 : end_line]
                return "".join(sliced_lines)
            return "".join(lines)
        except Exception as e:
            return f"Error al leer el archivo: {str(e)}"

    def apply_patch(self, filepath: str, target_content: str, replacement_content: str) -> str:
        if not self._is_allowed_path(filepath):
            return f"Error: Acceso denegado a la ruta {filepath}."
        
        if not os.path.exists(filepath):
            return f"Error: El archivo {filepath} no existe."

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            occurrences = content.count(target_content)
            if occurrences == 0:
                return "Error: No se encontró el texto objetivo exacto en el archivo para reemplazar."
            if occurrences > 1:
                return f"Error: Se encontraron {occurrences} ocurrencias del texto objetivo. Debe ser una coincidencia única para evitar errores."
            
            new_content = content.replace(target_content, replacement_content)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            return "Éxito: Parche aplicado correctamente."
        except Exception as e:
            return f"Error al aplicar el parche: {str(e)}"
