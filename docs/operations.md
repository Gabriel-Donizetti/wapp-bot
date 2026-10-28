# Migração e operação

Para instalar do zero e configurar as variáveis de ambiente, comece pelo
[guia Docker](docker.md). Este documento trata de migração, persistência e
diagnóstico de uma instalação.

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
leitura de QR, confirmação de código, sincronização, desconexão e falha da consulta. Quando a sessão
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

## Vinculação por QR ou código

Em **Sessões → Nova sessão → Forma de conexão**, escolha QR Code ou código com
número de telefone. Para usar código, informe o número com DDI, sem espaços ou
pontuação. Um `+` inicial é aceito. Confirme o código no WhatsApp desse celular
em **Aparelhos conectados → Conectar aparelho → Conectar com número de telefone**.

O estado `pairing` indica que a sessão aguarda a confirmação do código. A geração
pode demorar; o painel consulta o código a cada três segundos e mostra as novas
versões automaticamente. Use sempre o código mais recente. O WappHub deixa de
exibi-lo após três minutos, até receber outro; a validade efetiva é verificada
pelo WhatsApp. Após a confirmação, a sessão passa por `authenticated` até `ready`.

Se a geração falhar, confira o número e use **Reconectar**. No cartão da sessão,
**Conectar por código** e **Usar QR Code** permitem trocar o método. A troca
reinicia a conexão e preserva o perfil. Se a API informar `SESSION_BUSY`, aguarde
a inicialização ou o envio em andamento terminar antes de tentar novamente.

Desconectar preserva a autenticação: mudar o método ou informar outro telefone
não substitui uma conta já vinculada naquele perfil. Use uma nova sessão para
outro número. Após reiniciar a API, perfis autenticados são restaurados; uma
vinculação ainda pendente volta ao QR por padrão. Escolha novamente o método por
código se necessário.

Códigos e o número solicitado para vinculação ficam apenas em memória. O código
não aparece na listagem de sessões e deixa de ser disponibilizado após
autenticação, desconexão ou falha. Não publique códigos ou QR em logs e capturas.
As rotas exigem JWT; veja os exemplos e contratos no
[guia de integração](integration.md#conectar-por-código-sem-escanear-qr).

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

O watcher do Vite aguarda a gravação dos arquivos estabilizar antes de recompilar.
Isso reduz módulos vazios em cache durante formatação e troca de branch. Se um
servidor antigo ainda servir um módulo vazio, reinicie o frontend e recarregue a
página; HTTP 200 sozinho não comprova que o React renderizou.

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
para mensagens antigas. O monitor automático de confirmações está desativado:
não é iniciado no servidor e não há consulta de recuperação ao reconectar.
Entrega, leitura e reprodução continuam sendo atualizadas pelos eventos de ACK.
Sem novos eventos, o status salvo permanece até uma consulta manual explícita.

Consultas sem resultado preservam o status anterior. Não conclua falha apenas
por falta de ACK ou por a mensagem não estar mais disponível no cache da sessão.
Leitura depende das confirmações expostas pelo WhatsApp. Os horários são de
observação pelo WappHub, podendo coincidir em uma recuperação tardia.

A listagem de sessões e as operações verificam se a comunicação com o Chrome e
as funções de confirmação continuam disponíveis. Se essa comunicação se perder,
a sessão passa para `error`, com orientação para reconectar. Isso impede que uma
sessão antiga continue aparecendo como pronta enquanto todas as consultas falham.
Os recibos já registrados são preservados. Reconecte em **Sessões → Reconectar**;
o perfil existente é reutilizado, sem reenviar as mensagens anteriores. Se o
Chrome local continuar aberto após perder a conexão CDP, a reconexão encerra
somente o processo que pertence àquela sessão antes de abrir outro.

Timeouts continuam `unknown` até surgir resultado confiável; uma resposta tardia
no mesmo processo atualiza o registro sem reenviar. A sessão permanece ocupada
até a chamada original terminar, impedindo remoção do perfil durante o envio.
Se o processo encerrar antes de conhecer o ID, o resultado pode permanecer
incerto. Preserve a chave de idempotência e confira a conversa antes de repetir.

O encerramento HTTP aguarda as respostas ativas, incluindo chamadas de envio,
e fecha conexões de preconnect sem requisição. Isso evita que o recarregamento
local fique preso aguardando uma conexão ociosa do navegador. A confirmação
continua sujeita à política de resultados incertos descrita acima.

## Prazo e coleta de votos das enquetes

A migração 004 cria `poll_votes` e `poll_sync` e atribui 24 horas às enquetes
antigas sem duração. O prazo é calculado a partir da submissão; registros
incertos sem ID usam a criação. Agendamentos pendentes iniciam o prazo somente
após enviar. Nenhum registro é excluído quando a enquete expira.

O job de enquetes roda a cada minuto e coleta até 50 enquetes por sessão em cada
ciclo, enquanto a sessão estiver pronta. Também coleta ao conectar e quando a
biblioteca informa mudanças de votos. A janela de respostas pode ficar fechada.
Os votos são persistidos por sessão, ID WhatsApp, participante e horário, o que
preserva seleções já coletadas mesmo depois de uma nova seleção ou retirada.

As queries da lista de ativas e do job excluem enquetes expiradas. O job exige
`expiresAt > NOW()`, mesmo quando ainda não houve coleta. Não existe coleta final
após o prazo; eventos e consultas manuais também respeitam esse limite. As
respostas no histórico usam somente os dados salvos e consideram a última versão
coletada de cada participante até o limite;
votos posteriores ficam fora da contagem. A biblioteca instalada não oferece
encerramento nativo da votação no chat. O WappHub não exclui a mensagem nem
altera permissões do grupo para simular esse bloqueio.

As expiradas saem de **Enquetes**, mas seguem em **Histórico** e **Agendamentos**.
`GET /polls?state=expired` também permite listá-las. Se a sessão estiver offline
ou a consulta falhar, dados já coletados são retornados como `source: stored`,
com a última coleta e um aviso. Sem dados anteriores, a consulta retorna erro.
Expiradas sem coleta confirmada retornam HTTP 409 (`POLL_RESULTS_UNAVAILABLE`).
Ausência de ID confirmado impede localizar os votos de uma tentativa incerta.

Consulte os logs `Falha ao coletar votos de enquete` se o job não conseguir
consultar o WhatsApp. A leitura normaliza IDs das opções, bytes dos votos e IDs
de participantes do armazenamento local do WhatsApp, sem depender do formato do
evento. O patch da biblioteca aguarda a gravação nativa antes de normalizar e
emitir os eventos; uma falha no evento não interrompe a persistência do voto no
WhatsApp. Ao atualizar a biblioteca, valide `poll-compatibility.test.ts` também.
O snapshot local do WhatsApp pode não permitir reconstruir escolhas de períodos
offline ou entre coletas: os resultados representam os votos coletados.
