import { createWriteStream, type WriteStream } from 'fs';

/**
 * Opens a WriteStream for the given file path, returning a promise that resolves when the stream is ready.
 *
 * @param filePath The path to the log file to write to.
 *
 * @returns A promise that resolves to a WriteStream for the log file.
 */
export async function openLogFileStream(filePath: string): Promise<WriteStream> {
  const stream = createWriteStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on('open', () => resolve(stream));
    stream.on('error', reject);
  });
}
