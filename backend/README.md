# Backend

## Credenciales locales de Google

El backend soporta tres formas de autenticacion para Google:

1. `GOOGLE_CREDENTIALS_JSON`
2. `GOOGLE_APPLICATION_CREDENTIALS`
3. Archivo local `backend/credentials.json`

El archivo `backend/credentials.json` es solo para desarrollo local y debe quedar fuera de Git.
Si existe y no hay variables de entorno configuradas, `api_main` lo detecta automaticamente.
