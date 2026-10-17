import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const version = require("whatsapp-web.js/package.json").version;
if (version !== "1.34.7") {
  throw new Error(
    "Revise a correção de mídia do whatsapp-web.js antes de mudar sua versão.",
  );
}
const path = require.resolve("whatsapp-web.js/src/util/Injected/Utils.js");
const original = readFileSync(path, "utf8");
let source = original;
function patch(anchor, replacement, marker) {
  if (source.includes(marker)) return;
  if (source.split(anchor).length !== 2)
    throw new Error(
      "Código do whatsapp-web.js diferente do esperado; correção não aplicada.",
    );
  source = source.replace(anchor, replacement);
}
// Backport de https://github.com/wwebjs/whatsapp-web.js/pull/201923.
// Remove também um __x_id undefined: a presença da propriedade já causa a colisão.
const anchor = "        // Bot's won't reply if canonicalUrl is set (linking)";
const marker =
  "        // WappHub: evita colisão entre o ID interno da mídia e o da mensagem.";
patch(anchor, `${marker}\n        delete message.__x_id;\n\n${anchor}`, marker);
// WhatsApp Web atual renomeou MsgKey._serialized para $1.
// https://github.com/wwebjs/whatsapp-web.js/issues/201845
const lookup = "Msg.get(newMsgKey._serialized);";
const fixedLookup = "Msg.get(newMsgKey._serialized ?? newMsgKey.$1);";
patch(lookup, fixedLookup, fixedLookup);
const serialize = "        delete msg.pendingAckUpdate;";
const serializerMarker =
  "        // WappHub: preserva o contrato público do ID WhatsApp após a renomeação para $1.";
patch(
  serialize,
  `${serializerMarker}
        if (msg.id && !msg.id._serialized && typeof msg.id.$1 === 'string') {
            msg.id = Object.assign({}, msg.id, { _serialized: msg.id.$1 });
        }

${serialize}`,
  serializerMarker,
);
if (source !== original) writeFileSync(path, source);

// Puppeteer pode perder um iframe durante a instalação de uma função, embora
// a página principal continue saudável: https://github.com/puppeteer/puppeteer/issues/15299
const bridgePath = require.resolve("whatsapp-web.js/src/util/Puppeteer.js");
const bridgeOriginal = readFileSync(bridgePath, "utf8");
source = bridgeOriginal;
const bridgeAnchor = "    await page.exposeFunction(name, fn);";
const bridgeMarker =
  "    // WappHub: aceita apenas o fechamento de um iframe com a função principal instalada.";
patch(
  bridgeAnchor,
  `${bridgeMarker}
    try {
        await page.exposeFunction(name, fn);
    } catch (error) {
        if (!page.isClosed() && /Protocol error \\((Runtime.addBinding|Page.addScriptToEvaluateOnNewDocument)\\): Target closed/.test(error.message)) {
            const installed = await page.evaluate(name => typeof window[name] === 'function', name).catch(() => false);
            if (installed) return;
        }
        throw error;
    }`,
  bridgeMarker,
);
if (source !== bridgeOriginal) writeFileSync(bridgePath, source);
