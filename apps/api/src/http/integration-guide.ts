import { readFile } from "node:fs/promises";
import { marked } from "marked";

export async function integrationGuide() {
  // O conteúdo vem apenas do documento versionado do projeto, nunca de usuários.
  const markdown = await readFile(
    new URL("../../../../docs/integration.md", import.meta.url),
    "utf8",
  );
  const content = marked.parse(markdown, { async: false });
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Guia de integração · WappHub</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #17352e; background: #f3f7f5; line-height: 1.65; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    header, main { max-width: 1040px; margin: auto; padding: 24px; }
    header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: center; }
    header > a { font-size: 20px; font-weight: 800; text-decoration: none; letter-spacing: .08em; }
    nav { display: flex; gap: 20px; flex-wrap: wrap; }
    main { background: white; border: 1px solid #dce8e2; border-radius: 16px; padding: 40px; margin-bottom: 32px; }
    h1, h2, h3 { line-height: 1.25; color: #103d31; }
    h1 { font-size: clamp(28px, 5vw, 40px); margin-top: 0; }
    h2 { margin-top: 48px; padding-top: 24px; border-top: 1px solid #dce8e2; }
    h3 { margin-top: 32px; }
    a { color: #087d5a; text-underline-offset: 3px; overflow-wrap: anywhere; }
    a:focus-visible { outline: 3px solid #087d5a; outline-offset: 4px; }
    p, li { overflow-wrap: anywhere; }
    code { font-family: ui-monospace, monospace; font-size: .9em; background: #edf4ef; padding: 2px 5px; border-radius: 4px; overflow-wrap: anywhere; }
    pre { background: #102d25; color: #e8f7ee; padding: 20px; border-radius: 10px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; color: inherit; overflow-wrap: normal; }
    table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: .92em; }
    th, td { border: 1px solid #dce8e2; text-align: left; padding: 12px; }
    th { background: #edf4ef; }
    @media (max-width: 600px) {
      header { padding: 20px 16px; }
      main { margin: 0 12px 24px; padding: 24px 16px; }
      nav { gap: 12px; font-size: .9em; }
    }
  </style>
</head>
<body>
  <header>
    <a href="/" aria-label="Voltar ao painel WappHub">WappHub</a>
    <nav aria-label="Documentação">
      <a href="/">Painel</a>
      <a href="/docs/">Swagger</a>
      <a href="/openapi.json">OpenAPI JSON</a>
    </nav>
  </header>
  <main>${content}</main>
</body>
</html>`;
}
