import { useCallback, useState } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import type { GroupReadReceipts } from "@wapp/contracts";
import { useResource } from "../lib/use-resource";
import { dateTime, ErrorBox, Loading, Modal } from "./ui";

export function GroupReaders({
  id,
  kind,
}: {
  id: string;
  kind: "messages" | "schedules";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const result = useResource<GroupReadReceipts>(
    open ? `/${kind}/${id}/read-receipts` : null,
    15_000,
  );
  return (
    <div className="group-readers">
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen(true)}
      >
        <CheckCheck size={14} /> Quem leu no grupo
      </button>
      {open && (
        <Modal title="Quem leu no grupo" onClose={close}>
          <ErrorBox message={result.error} />
          {result.loading && !result.data && <Loading />}
          {result.data && (
            <div className="group-reader-results">
              <p>
                {result.data.totalReaders}{" "}
                {result.data.totalReaders === 1
                  ? "participante com leitura confirmada"
                  : "participantes com leitura confirmada"}
              </p>
              {result.data.readers.length ? (
                <ul className="group-reader-list">
                  {result.data.readers.map((reader) => (
                    <li key={reader.id}>
                      <strong>{reader.name || "Nome indisponível"}</strong>
                      <small className="receipt-id">{reader.id}</small>
                      <span>
                        {reader.readAt
                          ? `Leu em ${dateTime(reader.readAt)}`
                          : "Horário da leitura indisponível"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma leitura confirmada pelo WhatsApp nesta consulta.</p>
              )}
              <small>Última consulta: {dateTime(result.data.fetchedAt)}</small>
            </div>
          )}
          <p className="footnote">
            Quem não aparece está com leitura não confirmada. Isso não comprova
            que a pessoa não leu. Atualiza a cada 15 segundos enquanto esta
            janela estiver aberta.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={result.loading}
            onClick={result.refresh}
          >
            <RefreshCw size={15} /> Atualizar leituras
          </button>
        </Modal>
      )}
    </div>
  );
}
