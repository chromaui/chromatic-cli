import { spawn } from 'yarn-or-npm';

const installDependencies = (options) =>
  new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(['install'], options);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(stderr);
    });
  });

export default installDependencies;
