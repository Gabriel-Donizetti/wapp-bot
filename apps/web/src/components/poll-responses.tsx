import { useCallback, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import type { PollResults } from "@wapp/contracts";
import { useResource } from "../lib/use-resource";
import { dateTime, ErrorBox, Loading, Modal } from "./ui";

export function PollResponses({
  id,
  kind,
}: {
  id: string;
  kind: "messages" | "schedules";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const result = useResource<PollResults>(
    open ? `/${kind}/${id}/poll-results` : null,
    15_000,
  );
  return (
    <div className="poll-responses">
      <button className="text-button" onClick={() => setOpen(true)}>
        <BarChart3 size={15} /> Ver respostas da enquete
      </button>
      {open && (
        <Modal title="Respostas da enquete" onClose={close}>
          <ErrorBox message={result.error} />
          {result.loading && !result.data && <Loading />}
          {result.data && (
            <div className="poll-results">
              <h3>{result.data.name}</h3>
              <p>
                {result.data.totalVoters}{" "}
                {result.data.totalVoters === 1
                  ? "participante"
                  : "participantes"}{" "}
                · {result.data.totalSelections}{" "}
                {result.data.totalSelections === 1 ? "seleção" : "seleções"}
              </p>
              {result.data.options.map((option) => (
                <div className="poll-option" key={option.id}>
                  <strong>
                    {option.name}: {option.votes}
                  </strong>
                  <progress
                    value={option.votes}
                    max={Math.max(1, result.data!.totalVoters)}
                    aria-label={`Votos em ${option.name}`}
                  />
                </div>
              ))}
              <div>
                <h3>Respostas por participante</h3>
                {result.data.votes.length ? (
                  result.data.votes.map((vote) => (
                    <div className="poll-voter" key={vote.voter}>
                      <strong>{vote.voter}</strong>
                      <p>
                        {vote.selectedOptions
                          .map((option) => option.name)
                          .join(", ") || "Voto retirado"}
                      </p>
                      <small>
                        {vote.updatedAt
                          ? dateTime(vote.updatedAt)
                          : "Horário indisponível"}
                      </small>
                    </div>
                  ))
                ) : (
                  <p>Nenhuma resposta disponível nesta consulta.</p>
                )}
              </div>
              <small>Consultado em {dateTime(result.data.fetchedAt)}</small>
            </div>
          )}
          <p className="footnote">
            Respostas disponíveis no histórico da sessão conectada. A consulta
            atualiza a cada 15 segundos enquanto esta janela estiver aberta.
          </p>
          <button
            className="secondary"
            disabled={result.loading}
            onClick={result.refresh}
          >
            <RefreshCw size={15} /> Atualizar respostas
          </button>
        </Modal>
      )}
    </div>
  );
}
