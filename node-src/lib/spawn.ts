import { spawn as packageCommand } from 'yarn-or-npm';

/**
 * Spawn a subprocess to interact with the user's package manager.
 * 
 * @param args Command arguments to pass to the package manager.
 * @param options Options to pass to the package manager.
 
 * @returns The result from the package manager command.
 */
export default function spawn(
  args: Parameters<typeof packageCommand>[0],
  options: Parameters<typeof packageCommand>[1] = {}
) {
  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = packageCommand(args, options);
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
}
