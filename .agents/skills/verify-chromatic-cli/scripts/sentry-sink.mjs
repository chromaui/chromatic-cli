#!/usr/bin/env node
// sentry-sink.mjs <port> <out.jsonl> <ready file>: stand in for Sentry's ingest host during one drive.
// control-chromatic starts it around a drive of a `build-ref --sentry` bundle, whose DSN points at
// http://<key>@127.0.0.1:<port>/<project>. It accepts every envelope, appends one JSON line per item
// ({ type, payload }) to <out.jsonl>, and answers 200 like Sentry does.
// An envelope is a header line, then an item header line and a payload line per item. Only attachments
// give a payload as a byte length that can span lines, and the CLI and the Action send none.
import { appendFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';

const [port, outFile, readyFile] = process.argv.slice(2);

const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    let body = Buffer.concat(chunks);
    // The transport gzips bodies over 32 KiB, such as events with many breadcrumbs.
    if (request.headers['content-encoding'] === 'gzip') body = gunzipSync(body);
    const [, ...lines] = body.toString('utf8').split('\n');
    for (let index = 0; index + 1 < lines.length; index += 2) {
      const { type } = JSON.parse(lines[index]);
      appendFileSync(
        outFile,
        `${JSON.stringify({ type, payload: JSON.parse(lines[index + 1]) })}\n`
      );
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  });
});

server.listen(Number(port), '127.0.0.1', () => writeFileSync(readyFile, 'ready\n'));
