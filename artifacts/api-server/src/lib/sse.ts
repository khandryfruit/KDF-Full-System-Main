import type { Response } from "express";

const clients = new Set<Response>();

export function addSSEClient(res: Response) {
  clients.add(res);
}

export function removeSSEClient(res: Response) {
  clients.delete(res);
}

export function broadcastSSE(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}

export function getSSEClientCount() {
  return clients.size;
}
