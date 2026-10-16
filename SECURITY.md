# Segurança

Não publique senhas, JWTs, URLs de banco com credenciais, arquivos `.env`,
mensagens reais ou perfis do WhatsApp em issues, logs ou pull requests.

Para comunicar uma vulnerabilidade, use o recurso **Report a vulnerability**
na aba Security do repositório, quando disponível. Se estiver indisponível,
solicite um canal privado ao mantenedor sem expor detalhes de exploração.

Para uma instalação pública, termine HTTPS no proxy, configure origens CORS
explicitamente, restrinja o acesso ao PostgreSQL e proteja backups e volumes.
O frontend usa JWT em sessionStorage; encerrar a aba remove o armazenamento da
sessão do navegador. Logout e troca de senha também revogam os tokens no banco.

O projeto depende de um cliente WhatsApp não oficial. Na versão inicial, o
`npm audit` reporta alertas altos na cadeia transitiva do Puppeteer. Consulte
`npm audit` para o estado atual; atualizações devem validar a compatibilidade
com whatsapp-web.js e com a versão do WhatsApp Web usada na instalação.
