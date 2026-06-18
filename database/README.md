# Banco de dados BC Taxi

## Supabase (recomendado)

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor** e execute o conteúdo de `schema.sql`
3. Em **Project Settings → Database**, copie a **Connection string** (URI)
4. Crie `apps/api/.env`:

```env
PORT=3000
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
JWT_SECRET=uma-string-longa-e-aleatoria
```

5. Crie `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

6. Inicie a API:

```bash
cd apps/api
npm run dev
```

7. Inicie o app:

```bash
cd apps/mobile
npm start -- --web
```

Abra **http://localhost:8081/login**

## Tabelas

- **users** — conta (email, senha hash, nome, papel)
- **drivers** — perfil extra quando `role = driver`

Cadastro via `POST /auth/register` grava direto no PostgreSQL.
