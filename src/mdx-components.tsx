import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Mermaid } from '@/components/mdx/mermaid';
import type { MDXComponents } from 'mdx/types';
import ApiPageServer, { type ApiPageServerProps } from '@/components/mdx/ApiPageServer';

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  // Keep this file a React Server Component by not marking it as 'use client'.
  // Mermaid is a client component but we can safely include it as a value; it will be rendered client-side where used.
  return {
    ...defaultMdxComponents,
    Mermaid,
    APIPage: (props: ApiPageServerProps) => <ApiPageServer {...props} />,
    ...components,
  };
}
