import { spawn } from 'yarn-or-npm';

export default (args: Parameters<typeof spawn>[0], options: Parameters<typeof spawn>[1] = {}) =>
  new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(args, options);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr));
    });
  });
