import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api.js';
import Footer from '../components/Footer.jsx';
import { blogMetadata, blogStructuredData, renderBlogContent } from '../../../shared/blogPresentation.mjs';

function initialData(key) {
  try {
    const boot = JSON.parse(document.getElementById('blog-published-data')?.textContent || 'null');
    return boot?.key === key ? boot.data : null;
  } catch { return null; }
}
function setTag(attribute, name, content) {
  let node = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!node) { node = document.createElement('meta'); node.setAttribute(attribute, name); document.head.appendChild(node); }
  node.content = content;
}
export default function Blog() {
  const { slug } = useParams(), location = useLocation();
  const page = new URLSearchParams(location.search).get('page') || '1';
  const key = slug ? `/blog/${slug}` : `/blog?page=${page}`;
  const bootRef = useRef({ key, data: initialData(key) });
  const [state, setState] = useState(() => ({ key, data: bootRef.current.data, error: '', missing: false }));
  const [retry, setRetry] = useState(0);
  const data = state.key === key ? state.data : null;
  useEffect(() => {
    const controller = new AbortController();
    const boot = bootRef.current.key === key ? bootRef.current.data : null;
    setState({ key, data: boot, error: '', missing: false });
    // The Worker already fetched this exact published snapshot. Reuse it once.
    if (boot && !retry) return () => controller.abort();
    api.get(slug ? `/v1/blog/posts/${encodeURIComponent(slug)}` : '/v1/blog/posts', { params: slug ? undefined : { page }, signal: controller.signal }).then(({ data: response }) => {
      setState({ key, data: response.data, error: '', missing: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, data: null, missing: error.response?.status === 404, error: error.response?.status === 404 ? 'This article or blog page is no longer available.' : 'We could not load the blog. Check your connection and try again.' });
    });
    return () => controller.abort();
  }, [key, retry]);
  useLayoutEffect(() => {
    if (data || state.key === key && state.error) { document.getElementById('blog-server-content')?.remove(); document.documentElement.removeAttribute('data-blog-ssr'); }
    if (!data) return;
    const meta = blogMetadata(data);
    document.title = meta.title;
    setTag('name', 'description', meta.description);
    setTag('name', 'robots', 'index,follow');
    document.head.querySelectorAll('meta[property^="article:"]').forEach(node => node.remove());
    if (data.kind === 'article') { setTag('property', 'article:published_time', data.post.publishedAt); setTag('property', 'article:modified_time', data.post.updatedAt); }
    for (const [name, content] of Object.entries({ title: meta.title, description: meta.description, url: meta.canonical, image: meta.image, type: meta.type })) setTag('property', `og:${name}`, content);
    for (const [name, content] of Object.entries({ title: meta.title, description: meta.description, image: meta.image, card: 'summary_large_image' })) setTag('name', `twitter:${name}`, content);
    document.head.querySelectorAll('link[rel="canonical"]').forEach(node => node.remove());
    const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = meta.canonical; canonical.dataset.blogMeta = 'true'; document.head.appendChild(canonical);
    document.head.querySelectorAll('script[data-blog-schema]').forEach(node => node.remove());
    const scripts = blogStructuredData(data).map(value => { const node = document.createElement('script'); node.type = 'application/ld+json'; node.dataset.blogSchema = 'true'; node.textContent = JSON.stringify(value); document.head.appendChild(node); return node; });
    return () => { canonical.remove(); scripts.forEach(node => node.remove()); };
  }, [data, key, state.error]);
  useEffect(() => {
    if (state.key !== key || !state.error) return;
    document.title = 'Blog unavailable · Veylo';
    setTag('name', 'robots', 'noindex,follow');
  }, [state.error, key]);
  useEffect(() => () => {
    document.getElementById('blog-published-data')?.remove();
    document.head.querySelectorAll('meta[property^="article:"]').forEach(node => node.remove());
    setTag('name', 'robots', 'index,follow');
  }, []);
  if (!data) return <><div className="vb-state" role={state.error ? undefined : 'status'}>{state.error ? <><h1>{state.missing ? 'Page not found.' : 'The blog could not load.'}</h1><p>{state.error}</p>{!state.missing && <button className="vb-button" onClick={() => setRetry(value => value + 1)}>Try again</button>}<a className="vb-button vb-button-secondary" href="/blog">Back to the blog</a></> : <p>Opening the blog…</p>}</div><Footer /></>;
  return <><motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} dangerouslySetInnerHTML={{ __html: renderBlogContent(data) }} /><Footer /></>;
}
