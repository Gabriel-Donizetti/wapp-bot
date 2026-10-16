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

## Desenvolvimento sem containers

A execução local usa `npm run db:local:start`, `npm run db:migrate` e
`npm run dev`. O painel React fica em `http://127.0.0.1:5173`; a API,
o Swagger e o painel compilado ficam em `http://127.0.0.1:3000`.
Pare os containers da instalação antes de restaurar perfis ou reutilizar portas.
Não abra a mesma sessão em uma API local e outra em Docker ao mesmo tempo.

Para migrar um PostgreSQL em Docker para um PostgreSQL nativo, pare a API,
faça `pg_dump --no-owner --no-privileges`, restaure em um banco local vazio e
copie o perfil offline para `data/auth`. Preserve backup do `.env`, banco e
perfis anteriores. Atualize `DATABASE_URL` e `TEST_DATABASE_URL` para a porta
local. A restauração entre versões maiores exige verificar compatibilidade do
dump; não copie diretórios internos de dados de PostgreSQL entre versões.

O script local usa os binários instalados no host, ou `LOCAL_POSTGRES_BIN`.
Em ambientes sem instalação global, eles podem ser extraídos dos pacotes da
distribuição para uma pasta privada. `db:local:stop` para o banco privado sem
excluir os dados. Depois, `docker compose build` verifica as imagens sem
iniciar serviços.

## Mídias e agendamentos

O JSON aceita até 24 MiB; cada arquivo decodificado aceita até 16 MiB.
Nginx e Express usam o mesmo teto. Mantenha o limite no proxy se adicionar um.
Envios imediatos guardam somente metadados; agendamentos guardam bytes no
PostgreSQL enquanto pendentes/em andamento. Conclusão, falha, cancelamento ou
recuperação como `unknown` remove o payload e preserva resumo, tipo e hash.
Backups podem conter payloads anteriores; proteja-os junto aos perfis.

Google Chrome é necessário para formatos de vídeo com codecs proprietários.
O Docker amd64 o inclui; a variante ARM usa Chromium e exige validação dos
codecs. FFmpeg é incluído nas imagens para figurinhas animadas e deve estar
instalado no host se esse formato for usado localmente.
