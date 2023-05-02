import { command } from 'execa';
import express from 'express';

export async function main() {
  const app = express();

  // Plan:
  // Iteration 1: HTTP server, build execs out to cli
  // Iteration 2: HTTP server, build/appId calls out to CLI
  // Iteration 3: Split package up, addon calls via node API on server channel.
  app.post('/build', async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');

    const child = command('yarn chromatic', { stdio: 'pipe' });

    let done;
    console.log('started child');
    child.stdout.on('data', (d) => {
      const s = d.toString('utf8');
      // console.log('got data');
      // console.log(s);

      const match = s.match(/(https:\/\/www\.chromatic\.com\/build.*)/);
      if (match) {
        console.log(`GOT URL: ${match[0]}`);
        res.json({ url: match });
        done = true;
      }
    });

    child.on('exit', (code) => {
      // console.log(`child process exited with code ${code}`);

      if (!done) {
        res.status(500).json({ error: 'Shrug' });
      }
    });
  });

  app.listen(8765, () => {
    console.log('Listening on port 8765');
  });
}
