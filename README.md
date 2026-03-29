# shareyourgarden-backend

Backend API (NestJS + MongoDB) para ShareYourGarden.

## Configuración

1. Copia variables de entorno:

```bash
cp .env.example .env
```

2. Ajusta valores en `.env`:

- `MONGODB_URI`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_ALLOWED_REDIRECT_URIS` (CSV)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `GOOGLE_AUTH_RATE_LIMIT_MAX` (opcional)
- `GOOGLE_AUTH_RATE_LIMIT_WINDOW_MS` (opcional)

## Scripts

```bash
yarn install
yarn start:dev
yarn test
yarn test:e2e
```

## Auth con Google (Authorization Code Flow)

### Endpoint

`POST /auth/google`

### Request

```json
{
  "code": "AUTH_CODE_FROM_GOOGLE",
  "redirectUri": "https://<frontend-origin>"
}
```

### Response

```json
{
  "user": {
    "name": "string",
    "email": "string",
    "picture": "string",
    "sub": "string"
  },
  "token": "APP_JWT"
}
```

### Validaciones y seguridad

- Solo se confía en `code` y `redirectUri` enviados por frontend.
- `redirectUri` se valida contra `GOOGLE_ALLOWED_REDIRECT_URIS`.
- Se intercambia el `code` contra Google Token Endpoint.
- Se verifica `id_token` (firma RS256, issuer, audience, exp, claims).
- Se aplica rate-limit básico por IP para `/auth/google`.

### Códigos de error esperados

- `400` request inválido (payload)
- `401` code/token inválido
- `403` origen/redirectUri no permitido
- `429` demasiados intentos
- `500` error interno
