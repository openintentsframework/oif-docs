import { APIPage as InternalAPIPage } from 'fumadocs-openapi/ui';
import { openapi } from '@/lib/openapi';

type HttpMethod = 'get' | 'post' | 'patch' | 'delete' | 'head' | 'put';

type OperationInfo = { tags?: string[] };
type MethodMap = Partial<Record<HttpMethod, OperationInfo | undefined>>;
type OpenAPIDocumentMinimal = {
  paths?: Record<string, MethodMap | undefined>;
  webhooks?: Record<string, MethodMap | undefined>;
};

function buildItems(document: OpenAPIDocumentMinimal) {
  const methodKeys: HttpMethod[] = ['get', 'post', 'patch', 'delete', 'head', 'put'];
  const operations: { method: HttpMethod; path: string; tags?: string[] }[] = [];
  const webhooks: { method: HttpMethod; name: string; tags?: string[] }[] = [];

  const paths = document.paths ?? {};
  for (const path in paths) {
    const pathItem = paths[path];
    if (!pathItem) continue;
    for (const methodKey of methodKeys) {
      const operation = pathItem[methodKey];
      if (!operation) continue;
      operations.push({ method: methodKey, path, tags: operation.tags });
    }
  }

  const webhooksMap = document.webhooks ?? {};
  for (const name in webhooksMap) {
    const pathItem = webhooksMap[name];
    if (!pathItem) continue;
    for (const methodKey of methodKeys) {
      const operation = pathItem[methodKey];
      if (!operation) continue;
      webhooks.push({ method: methodKey, name, tags: operation.tags });
    }
  }

  return { operations, webhooks };
}

export type ApiPageServerProps = {
  document: string;
};

export default async function APIPageServer({ document }: ApiPageServerProps) {
  const props = openapi.getAPIPageProps({ document, hasHead: true });
  const processed = (await props.document) as { dereferenced: OpenAPIDocumentMinimal };
  const { operations, webhooks } = buildItems(processed.dereferenced);
  return (
    <InternalAPIPage
      {...props}
      operations={operations}
      webhooks={webhooks}
    />
  );
}


