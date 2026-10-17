import type { Server } from "node:http";
import type { Socket } from "node:net";

// Fecha conexões de preconnect sem interromper respostas de envios em andamento.
export function prepareShutdown(server: Server): () => Promise<void> {
  const sockets = new Set<Socket>();
  const requests = new Map<Socket, number>();
  let closing: Promise<void> | undefined;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
      requests.delete(socket);
    });
  });
  server.prependListener("request", (req, res) => {
    const socket = req.socket;
    requests.set(socket, (requests.get(socket) ?? 0) + 1);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const remaining = (requests.get(socket) ?? 1) - 1;
      if (remaining > 0) requests.set(socket, remaining);
      else {
        requests.delete(socket);
        if (closing && !socket.destroyed) socket.end();
      }
    };
    res.once("finish", finish);
    res.once("close", finish);
  });
  return () => {
    if (closing) return closing;
    closing = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    for (const socket of sockets) if (!requests.has(socket)) socket.destroy();
    return closing;
  };
}
