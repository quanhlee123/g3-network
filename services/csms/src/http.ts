// F-G2 — HTTP nội bộ tối giản của CSMS (chuẩn bị luồng thanh toán QR F-H1):
// POST /internal/remote-start {stationCode, connectorId, idTag}
// POST /internal/remote-stop  {stationCode, transactionId}
// KHÔNG expose ra internet công cộng (quy tắc 12) — chỉ backend nội bộ gọi.
// API công khai của hệ vẫn nằm ở apps/api (OpenAPI); endpoint này là ống nối kỹ thuật.
import http from 'node:http';
import type { SessionRegistry } from './ws-server';

export function startInternalHttp(port: number, sessions: SessionRegistry): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST' || !req.url?.startsWith('/internal/')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'khong_tim_thay' }));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'json_khong_hop_le' }));
        return;
      }
      const stationCode = String(body.stationCode ?? '');
      const session = sessions.get(stationCode);
      if (!session) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'tram_khong_ket_noi', stationCode }));
        return;
      }
      if (req.url === '/internal/remote-start') {
        const status = await session.remoteStart(Number(body.connectorId ?? 1), String(body.idTag));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status }));
        return;
      }
      if (req.url === '/internal/remote-stop') {
        const status = await session.remoteStop(Number(body.transactionId));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'khong_tim_thay' }));
    })().catch((err: unknown) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });
  server.listen(port);
  return server;
}
