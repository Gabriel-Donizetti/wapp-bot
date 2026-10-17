# Migração e operação

## Compatibilidade do envio de mídia

A versão `whatsapp-web.js@1.34.7` recebe correções locais por
`scripts/patch-whatsapp.mjs`, executado pelo `postinstall` do `npm install` e
`npm ci`, inclusive no build Docker:

- Remove o `__x_id` privado de `MediaData` antes de criar o modelo da mensagem.
  Evita o erro `Data passed to getter must include an id property`.
- Aceita o identificador de mensagem renomeado de `_serialized` para `$1` no
  WhatsApp Web atual, tanto na consulta após envio quanto na resposta pública.

Se a sessão permanecer em **Sincronizando**, é possível reiniciar a conexão em
**Sessões**, sem apagar o perfil. O formulário de envio distingue inicialização,
leitura de QR, sincronização, desconexão e falha da consulta. Quando a sessão
fica pronta, carrega a lista automaticamente e repete a consulta a cada 15
segundos; falhas não são apresentadas como zero contatos.

O mesmo script trata a [corrida do Puppeteer na exposição de funções](https://github.com/puppeteer/puppeteer/issues/15299):
um iframe que fecha durante a instalação dos eventos não deve interromper a
inicialização se a função já estiver instalada na página principal saudável.
Página fechada, função ausente e erros de outra natureza continuam falhando.

A correção de mídia deriva da [PR 201923](https://github.com/wwebjs/whatsapp-web.js/pull/201923).
A compatibilidade de IDs segue o diagnóstico da
[issue 201845](https://github.com/wwebjs/whatsapp-web.js/issues/201845).
O script é idempotente e recusa versões ou código diferentes do esperado.
Ao atualizar a biblioteca, revise o script e os testes de compatibilidade;
não desative os scripts de instalação. Se instalou com `--ignore-scripts`,
execute `npm run postinstall` antes de iniciar a API.

Falhas no envio mantêm a causa técnica nos logs do servidor e o estado público
incerto quando não houver confirmação. A correção não reenvia tentativas antigas.

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

## Confirmações de envio e recuperação

`message_receipts` guarda os ACKs por sessão e ID WhatsApp. As consultas juntam
esses recibos aos envios imediatos e agendados; o status apresentado é derivado
da confirmação mais forte, sem substituir entrega ou leitura por eventos
atrasados. O campo interno `sent_at` dos registros antigos preserva o instante
de submissão e é exposto como `submittedAt`; o `sentAt` público vem do ACK.

A migração 003 cria recibos sem ACK para IDs legados. Não inventa confirmação
para mensagens antigas. O monitor consulta no máximo 50 pendências por sessão
e ciclo, a cada 30 segundos, e também roda após a conexão. Voz e áudio podem
continuar sendo consultados depois de lidos para recuperar a reprodução.

Consultas sem resultado preservam o status anterior. Não conclua falha apenas
por falta de ACK ou por a mensagem não estar mais disponível no cache da sessão.
Leitura depende das confirmações expostas pelo WhatsApp. Os horários são de
observação pelo WappHub, podendo coincidir em uma recuperação tardia.

Timeouts continuam `unknown` até surgir resultado confiável; uma resposta tardia
no mesmo processo atualiza o registro sem reenviar. A sessão permanece ocupada
até a chamada original terminar, impedindo remoção do perfil durante o envio.
Se o processo encerrar antes de conhecer o ID, o resultado pode permanecer
incerto. Preserve a chave de idempotência e confira a conversa antes de repetir.

O encerramento HTTP aguarda as respostas ativas, incluindo chamadas de envio,
e fecha conexões de preconnect sem requisição. Isso evita que o recarregamento
local fique preso aguardando uma conexão ociosa do navegador. A confirmação
continua sujeita à política de resultados incertos descrita acima.
