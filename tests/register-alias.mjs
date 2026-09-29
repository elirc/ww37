import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(testsDirectory, '..', 'src');

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) {
    return nextResolve(specifier, context);
  }

  const relative = specifier.slice(2);
  const candidate = path.join(sourceDirectory, relative);
  for (const extension of ['', '.ts', '.tsx', '.js', '.mjs']) {
    const filename = candidate + extension;
    try {
      await access(filename);
      return nextResolve(pathToFileURL(filename).href, context);
    } catch {
      // Try the next source extension.
    }
  }

  throw new Error('Cannot resolve source alias: ' + specifier);
}
