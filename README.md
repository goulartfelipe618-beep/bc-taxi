# BC Taxi

App de mobilidade urbana — **Expo (React Native)** + API Node.js + PostgreSQL.

## Estrutura

```
apps/
├── mobile/   ← App (único frontend)
└── api/      ← Backend (auth, corridas)
database/     ← Schema SQL
```

## Rodar localmente

### 1. Banco + API

Configure `apps/api/.env` (veja `database/README.md`) e inicie:

```bash
cd apps/api
npm run dev
```

### 2. App

```bash
cd apps/mobile
npm start -- --web
```

Abra **http://localhost:8081/login**

- Login: `/login`
- Cadastro: `/register`
- App: `/` (redireciona conforme sessão)
