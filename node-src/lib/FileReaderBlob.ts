import { ReadStream, createReadStream } from 'fs';

export class FileReaderBlob {
  readStream: ReadStream;
  size: number;

  constructor(filePath: string, contentLength: number, onProgress: (delta: number) => void) {
    this.size = contentLength;
    this.readStream = createReadStream(filePath);
    this.readStream.on('data', (chunk: Buffer | string) => onProgress(chunk.length));
  }

  stream() {
    return this.readStream;
  }

  get [Symbol.toStringTag]() {
    return 'Blob';
  }
}
