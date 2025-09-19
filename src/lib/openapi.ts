import { createOpenAPI } from 'fumadocs-openapi/server';
import fs from 'node:fs';
import path from 'node:path';

function collectOpenAPISchemaInputs(): string[] {
  const rootDirectory = process.cwd();
  const openapiDirectory = path.join(rootDirectory, 'openapi');

  if (!fs.existsSync(openapiDirectory)) return [];

  const entries = fs.readdirSync(openapiDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const isSchema = /\.(json|ya?ml)$/i.test(entry.name);
    if (!isSchema) continue;
    const absolutePath = path.join(openapiDirectory, entry.name);
    const relativePath = `.${path.sep}${path.relative(rootDirectory, absolutePath)}`;
    files.push(relativePath);
  }

  return files;
}

const inputs = collectOpenAPISchemaInputs();

export const openapi = createOpenAPI({
  input: inputs,
});

export const defaultOpenAPIDocument = inputs[0] ?? './openapi/petstore.json';


