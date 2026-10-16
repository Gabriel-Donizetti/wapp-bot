# Migração e operação

## Preservar uma instalação local ao passar para Docker

1. Pare a API que utiliza os perfis. Não abra dois Chromium no mesmo perfil.
2. Guarde uma cópia de `data/auth` e do banco antes de iniciar.
3. Inicie apenas o PostgreSQL: `docker compose up -d --wait db`.
4. Execute `npm run db:migrate` e `npm run db:import-sqlite` quando houver um
   SQLite legado. A URL local `DATABASE_URL` deve apontar ao banco desse Compose.
5. Prepare a API sem iniciá-la: `docker compose create api`.
6. Copie os perfis e ajuste a propriedade dos arquivos:

```bash
docker compose cp ./data/auth api:/app/data/auth
docker compose run --rm --no-deps --user root --entrypoint sh api \
  -c 'find /app/data/auth -maxdepth 2 -type l -name "Singleton*" -delete; chown -R node:node /app/data'
docker compose up -d --build --wait
```

Essa limpeza remove locks do Chromium que podem apontar para processos do host
anterior. Execute-a somente na cópia offline, com a API e o navegador parados.
Os perfis ficam no volume `whatsapp-data`. A restauração depende de o vínculo
continuar válido no WhatsApp; se houver revogação, reconecte pelo painel.
Não copie arquivos de perfil enquanto o navegador estiver aberto.

## Backups

Faça um dump do PostgreSQL e um backup do volume de perfis com a API parada.

```bash
docker compose exec -T db pg_dump -U wapp -d wapp > wapp-backup.sql
docker compose stop api web
docker compose cp api:/app/data ./wapp-profiles-backup
docker compose start api web
```

Os exemplos assumem usuário/banco `wapp`; ajuste conforme sua configuração.
Os dumps e perfis contêm dados pessoais e autenticação: armazene-os em local
protegido, fora do repositório. Antes de restaurar, confirme banco e destino.

## Diagnóstico

`GET /health` verifica HTTP e PostgreSQL. O estado do WhatsApp fica em
`GET /api/v1/sessions`; uma API saudável não significa que todas as sessões
estão conectadas. Use o `X-Request-ID` para correlacionar respostas com logs.

```bash
docker compose ps
docker compose logs --tail 100 api
docker compose logs --tail 100 web
docker compose logs --tail 100 db
```

Não reinicie ou recrie envios `unknown` automaticamente. Verifique primeiro se
a mensagem já existe no WhatsApp. A idempotência dos envios imediatos depende
de preservar usuário e chave de operação na repetição da mesma requisição.
