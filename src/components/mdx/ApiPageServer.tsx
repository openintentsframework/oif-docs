import { APIPage as InternalAPIPage } from 'fumadocs-openapi/ui';
import { openapi } from '@/lib/openapi';

type HttpMethod = 'get' | 'post' | 'patch' | 'delete' | 'head' | 'put';

function buildItems(document: any) {
  const methodKeys: HttpMethod[] = ['get', 'post', 'patch', 'delete', 'head', 'put'];
  const operations: { method: HttpMethod; path: string; tags?: string[] }[] = [];
  const webhooks: { method: HttpMethod; name: string; tags?: string[] }[] = [];

  for (const [path, pathItem] of Object.entries<any>(document.paths ?? {})) {
    if (!pathItem) continue;
    for (const methodKey of methodKeys) {
      if (!pathItem[methodKey]) continue;
      operations.push({ method: methodKey, path, tags: pathItem[methodKey]?.tags });
    }
  }

  for (const [name, pathItem] of Object.entries<any>(document.webhooks ?? {})) {
    if (!pathItem) continue;
    for (const methodKey of methodKeys) {
      if (!pathItem[methodKey]) continue;
      webhooks.push({ method: methodKey, name, tags: pathItem[methodKey]?.tags });
    }
  }

  return { operations, webhooks };
}

type Props = {
  document: string;
};

export default async function APIPageServer({ document }: Props) {
  const props = openapi.getAPIPageProps({ document, hasHead: true });
  const processed: any = await (props.document as Promise<any>);
  const { operations, webhooks } = buildItems(processed.dereferenced);
  return (
    <InternalAPIPage
      {...props}
      operations={operations}
      webhooks={webhooks}
    />
  );
}


