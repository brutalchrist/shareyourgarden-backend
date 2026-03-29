# shareyourgarden-backend

Backend NestJS con OAuth2 Google en modo **broker backend** (redirect fijo del API), compatible con dominios variables de Netlify Deploy Previews.

## Variables de entorno

Copia `.env.example` a `.env`.

Variables requeridas:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (callback fijo backend, ej. `https://api.tudominio.com/auth/google/callback`)
- `FRONTEND_RETURN_TO_ALLOWLIST` (CSV de orígenes permitidos; soporta `*`)
- `SESSION_SECRET`

## Google Cloud Console (OAuth)

1. En **APIs & Services > Credentials**, crea OAuth Client (Web application).
2. En **Authorized redirect URIs**, agrega el callback backend fijo:
   - `https://api.tudominio.com/auth/google/callback`
3. En **Authorized JavaScript origins** agrega solo los orígenes que usen flujo browser directo (si aplica).
4. Usa el `Client ID` y `Client Secret` en `.env`.

## Endpoints de auth broker

### `GET /auth/google/start?return_to=<frontend_url>`
Valida `return_to`, firma `state`, setea nonce anti-CSRF y redirige a Google.

### `GET /auth/google/callback`
Valida `state` + nonce, intercambia `code`, verifica `id_token`, crea sesión con cookie segura y redirige a `return_to`.

### `GET /auth/session`
Contrato JSON:

```json
{
  "authenticated": true,
  "user": {
    "sub": "google-sub",
    "email": "user@example.com",
    "name": "User",
    "picture": "https://..."
  }
}
```

O sin sesión:

```json
{
  "authenticated": false
}
```

### `POST /auth/logout`
Requiere header `x-csrf-token` que coincida con cookie CSRF. Invalida sesión y limpia cookies.

Contrato JSON:

```json
{
  "success": true
}
```

## CORS y cookies

- CORS dinámico contra `FRONTEND_RETURN_TO_ALLOWLIST`
- `Access-Control-Allow-Credentials: true`
- Cookies de sesión: `HttpOnly`, `Secure`, `SameSite=None`, `Path=/`

## Tests

```bash
yarn lint
yarn test --runInBand
yarn test:e2e --runInBand
```
