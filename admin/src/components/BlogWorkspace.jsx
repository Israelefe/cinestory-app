import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, FileText, Image, List, Loader2, Plus, RefreshCw, Save, Search, Type, X } from 'lucide-react';
import api from '../services/api.js';
import { renderBlogArticle } from '../../../shared/blogPresentation.mjs';
import '../../../client/src/styles/blog.css';
import './BlogWorkspace.css';

const base = '/v1/admin/blog';
const message = error => error.response?.data?.message || 'This action could not finish. Please try again.';
const active = job => job && ['queued', 'running'].includes(job.status);
function CoverPreview({ id, onUrl }) {
  const [url, setUrl] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl;
    setUrl(''); setError(''); onUrl('');
    if (id) api.get(`${base}/media/${id}/960`, { responseType: 'blob', signal: controller.signal }).then(({ data }) => {
      objectUrl = URL.createObjectURL(data); setUrl(objectUrl); onUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setError('The cover preview could not load.'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, onUrl]);
  return error ? <p className="bw-note" role="alert">{error}</p> : url ? <img className="bw-cover" src={url} alt="Article cover preview" /> : id ? <p className="bw-note">Loading cover photo…</p> : null;
}
function CoverPhotoChooser({ onSelect, disabled }) {
  const [photos, setPhotos] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    api.get(`${base}/cover-photos`, { signal: controller.signal }).then(({ data }) => setPhotos(Array.isArray(data.photos) ? data.photos : [])).catch(() => {});
    return () => controller.abort();
  }, []);
  return photos.length ? <div className="bw-cover-choices"><p className="bw-note">Choose a photograph already used on Veylo.</p><div>{photos.map(photo => <button type="button" disabled={disabled} aria-label={photo.label} key={photo.id} onClick={() => onSelect(photo.id)}><img src={photo.thumbnailUrl || photo.url} alt={photo.alt} loading="lazy" /><span>{photo.label}</span></button>)}</div></div> : null;
}
export default function BlogWorkspace({ admin, refreshKey = 0 }) {
  const [params, setParams] = useSearchParams(), postId = params.get('post') || '';
  const canEdit = ['superadmin', 'operations'].includes(admin.role);
  const [listing, setListing] = useState({ posts: [], pages: 1, aiConfigured: false }), [page, setPage] = useState(1), [query, setQuery] = useState(''), [status, setStatus] = useState('all');
  const [post, setPost] = useState(null), [form, setForm] = useState(null), [dirty, setDirty] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [job, setJob] = useState(null), [topics, setTopics] = useState([]);
  const [view, setView] = useState('write'), [preview, setPreview] = useState(null), [coverUrl, setCoverUrl] = useState(''), [reviewed, setReviewed] = useState(false);
  const [confirmAction, setConfirmAction] = useState('');
  const [topicSeed, setTopicSeed] = useState(''), [topicConflicts, setTopicConflicts] = useState([]);
  const editor = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    api.get(`${base}/generations`, { signal: controller.signal }).then(({ data }) => {
      const pending = data.jobs.find(value => active(value));
      if (pending) setJob(pending);
      const suggestions = data.jobs.find(value => value.kind === 'topics' && value.status === 'ready');
      if (suggestions) setTopics(suggestions.topics);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  const acceptPost = useCallback(value => { setPost(value); setForm({ draft: value.draft, slug: value.slug, notes: value.notes || '' }); setDirty(false); setReviewed(false); }, []);
  const loadList = useCallback(async signal => {
    const { data } = await api.get(`${base}/posts`, { params: { page, q: query, status }, signal });
    setListing(data);
    if (data.activeJobs?.length) setJob(current => active(current) ? current : data.activeJobs[0]);
  }, [page, query, status]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { setLoading(true); setError(''); loadList(controller.signal).catch(err => { if (!controller.signal.aborted) setError(message(err)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [loadList, refreshKey]);
  useEffect(() => {
    const controller = new AbortController();
    setPost(null); setForm(null); setError(''); setNotice(''); setView('write'); setPreview(null); setConfirmAction('');
    if (postId) api.get(`${base}/posts/${postId}`, { signal: controller.signal }).then(({ data }) => {
      acceptPost(data.post);
      if (data.post.activeJobId) api.get(`${base}/generations/${data.post.activeJobId}`, { signal: controller.signal }).then(({ data: result }) => setJob(result.job)).catch(() => {});
    }).catch(err => { if (!controller.signal.aborted) setError(message(err)); });
    return () => controller.abort();
  }, [postId, acceptPost]);
  useEffect(() => {
    if (!dirty) return;
    const leave = event => { event.preventDefault(); event.returnValue = ''; };
    const leaveSection = event => { if (!window.confirm('Leave this article without saving your changes?')) event.preventDefault(); };
    window.addEventListener('beforeunload', leave);
    window.addEventListener('veylo:leave-blog', leaveSection);
    return () => { window.removeEventListener('beforeunload', leave); window.removeEventListener('veylo:leave-blog', leaveSection); };
  }, [dirty]);
  useEffect(() => {
    if (!active(job)) return;
    const controller = new AbortController(); let timer;
    const poll = async () => {
      try {
        const { data } = await api.get(`${base}/generations/${job.id}`, { signal: controller.signal });
        setJob(data.job);
        if (active(data.job) || data.job.active) timer = setTimeout(poll, 2000);
        else {
          if (data.job.topics?.length) setTopics(data.job.topics);
          if (data.job.postId && data.job.postId === postId) acceptPost((await api.get(`${base}/posts/${postId}`, { signal: controller.signal })).data.post);
          if (data.job.status === 'ready') setNotice(data.job.kind === 'topics' ? 'Choose a topic below, or write your own.' : 'Your draft is ready. Read it through and check the facts before publishing.');
          if (data.job.status === 'failed') { setError(data.job.error); setTopicConflicts(data.job.conflicts || []); }
          await loadList(controller.signal);
        }
      } catch (err) {
        if (!controller.signal.aborted) { setError(`${message(err)} The writing job can continue in the background.`); timer = setTimeout(poll, 5000); }
      }
    };
    timer = setTimeout(poll, 1000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [job?.id, postId, acceptPost, loadList]);
  async function perform(fn) {
    setBusy(true); setError(''); setNotice(''); setTopicConflicts([]);
    try { return await fn(); } catch (err) { setError(message(err)); setTopicConflicts(err.response?.data?.conflicts || []); return null; } finally { setBusy(false); }
  }
  function navigate(id = '') {
    if (dirty && !window.confirm('Leave this article without saving your changes?')) return;
    setParams({ section: 'blog', ...(id ? { post: id } : {}) });
  }
  const create = () => perform(async () => {
    const { data } = await api.post(`${base}/posts`);
    acceptPost(data.post);
    setParams({ section: 'blog', post: data.post.id });
  });
  const createFromTopic = topic => perform(async () => {
    const { data } = await api.post(`${base}/articles/generate`, { topic: topic.title, keyword: topic.keyword || '', notes: topic.angle || '' });
    acceptPost(data.post); setJob(data.job);
    setParams({ section: 'blog', post: data.post.id });
  });
  function change(name, value, isDraft = true) {
    setForm(current => isDraft ? { ...current, draft: { ...current.draft, [name]: value } } : { ...current, [name]: value });
    setDirty(true); setReviewed(false); setPreview(null);
  }
  async function save() {
    const { bodyHtml, toc, readingMinutes, ...draft } = form.draft;
    const { data } = await api.patch(`${base}/posts/${post.id}`, { ...form, draft, revision: post.revision });
    acceptPost(data.post); return data.post;
  }
  const saveClick = () => perform(async () => { await save(); setNotice('Draft saved.'); });
  const startGeneration = (kind, rewrite = false) => perform(async () => {
    let current = post;
    if (kind === 'article' && dirty) current = await save();
    const { data } = await api.post(`${base}/generations`, { kind, ...(kind === 'article' ? { postId: current.id, revision: current.revision, topic: current.draft.title, keyword: current.draft.keyword, notes: current.notes, rewrite } : { topic: topicSeed }) });
    setJob(data.job);
  });
  const retryJob = () => perform(async () => { const { data } = await api.post(`${base}/generations/${job.id}/retry`); setJob(data.job); });
  const cancelJob = () => perform(async () => {
    const { data } = await api.post(`${base}/generations/${job.id}/cancel`); setJob(data.job);
    if (postId && data.job.postId === postId) acceptPost((await api.get(`${base}/posts/${postId}`)).data.post);
  });
  const lifecycle = operation => perform(async () => {
    const { data } = await api.post(`${base}/posts/${post.id}/${operation}`, { revision: post.revision, ...(operation === 'publish' ? { reviewed: true } : {}) });
    acceptPost(data.post); setConfirmAction(''); setNotice(operation === 'publish' ? 'Article published. It is now available on Veylo.' : operation === 'archive' ? 'Article archived. It is no longer public.' : operation === 'restore' ? 'Article restored as a draft.' : 'Article unpublished. Your draft is saved.');
    await loadList();
  });
  const uploadCover = file => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG, or WebP photo no larger than 5 MB.'); return; }
    perform(async () => {
      const current = dirty ? await save() : post;
      const body = new FormData(); body.append('cover', file);
      const { data } = await api.post(`${base}/posts/${current.id}/cover`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(value => ({ ...value, draft: { ...value.draft, coverId: data.coverId, coverAlt: '', coverCredit: '' } }));
      setDirty(true); setReviewed(false); setPreview(null);
      setNotice('Cover designed from your photo. Add a photo description, then save the draft.');
    });
  };
  const showPreview = () => perform(async () => { const { data } = await api.post(`${base}/preview`, { markdown: form.draft.markdown }); setPreview(data); setView('preview'); });
  const generateCover = photoId => perform(async () => {
    const current = dirty ? await save() : post;
    const { data } = await api.post(`${base}/posts/${current.id}/cover/generate`, { revision: current.revision, ...(photoId ? { photoId } : {}) });
    setForm(value => ({ ...value, draft: { ...value.draft, ...data } }));
    setDirty(true); setReviewed(false); setPreview(null); setNotice('Cover ready. Save the draft to keep it.');
  });
  function format(prefix, suffix = '') {
    const node = editor.current;
    if (!node) return;
    const start = node.selectionStart, end = node.selectionEnd, source = form.draft.markdown;
    change('markdown', source.slice(0, start) + prefix + source.slice(start, end) + suffix + source.slice(end));
    requestAnimationFrame(() => { node.focus(); node.setSelectionRange(start + prefix.length, end + prefix.length); });
  }
  function previewLink(event) {
    const href = event.target.closest('a')?.getAttribute('href');
    if (href?.startsWith('/') && !href.startsWith('//')) { event.preventDefault(); window.open(`https://veylo.com.ng${href}`, '_blank', 'noopener,noreferrer'); }
  }
  const locked = busy || active(job) && job.postId === postId || Boolean(post?.activeJobId) || !canEdit || post?.status === 'archived';
  const errorPanel = error && <div className="bw-message bw-error" role="alert"><div><p>{error}</p>{topicConflicts.map(item => <div className="bw-topic-conflict" key={item.id}><strong>{item.title}</strong><div className="bw-actions"><button type="button" className="bw-text-button" onClick={() => navigate(item.id)}>Open existing article</button><a className="bw-text-button" href={`https://veylo.com.ng${item.url}`} target="_blank" rel="noopener noreferrer">Read published article <ArrowUpRight size={14} /></a></div></div>)}</div><button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>;
  const jobPanel = job && <div className="bw-job" role="status"><div>{active(job) ? <Loader2 className="bw-spinner" size={18} /> : <FileText size={18} />}<span><strong>{job.status === 'queued' ? 'Waiting for the writing service' : job.status === 'running' ? (job.stage || 'Writing your draft') : job.status === 'ready' ? 'Writing complete' : job.status === 'failed' ? 'Writing stopped' : 'Writing cancelled'}</strong><small>{job.kind === 'topics' ? 'Topic suggestions' : 'Article draft'} · {active(job) ? 'You can leave this page and return later.' : job.error || 'Your existing published article is unchanged.'}</small></span></div>{canEdit && active(job) && <button type="button" disabled={busy} onClick={cancelJob}>Cancel</button>}{canEdit && ['failed', 'cancelled'].includes(job.status) && <button type="button" disabled={busy} onClick={retryJob}><RefreshCw size={14} />Retry</button>}{!active(job) && <button type="button" aria-label="Dismiss writing status" onClick={() => setJob(null)}><X size={16} /></button>}</div>;
  if (!postId) return <motion.div className="bw-workspace" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <div className="bw-intro"><div><p className="bw-eyebrow">WRITE FOR THE PEOPLE BEHIND THE CAMERA</p><h2>Useful articles. Your voice.</h2><p>Start with a topic, let AI prepare a draft, then make it yours before publishing.</p></div>{canEdit && <div className="bw-actions"><button type="button" className="bw-button bw-secondary" disabled={busy || active(job) || !listing.aiConfigured} onClick={() => startGeneration('topics')}><List size={16} />Suggest topics</button><button type="button" className="bw-button" disabled={busy} onClick={() => create()}><Plus size={16} />New article</button></div>}</div>
    {errorPanel}{notice && <p className="bw-message" role="status">{notice}</p>}{jobPanel}
    {canEdit && <section className="bw-topic-start" aria-label="Start an article"><label className="bw-label">What would you like to write about?<input value={topicSeed} maxLength={180} onChange={event => setTopicSeed(event.target.value)} placeholder="e.g. delivering traditional wedding photos with Veylo" /></label><div className="bw-actions"><button type="button" className="bw-button" disabled={busy || active(job) || !listing.aiConfigured || topicSeed.trim().length < 3} onClick={() => createFromTopic({ title: topicSeed })}><FileText size={16} />Generate article</button><p className="bw-note">Write on your topic, or use Suggest topics for different angles. Suggestions use current Veylo knowledge and published articles.</p></div></section>}
    {!listing.aiConfigured && <p className="bw-note">AI writing is not configured. You can still write and publish articles yourself.</p>}
    {topics.length > 0 && <section className="bw-topics" aria-label="Suggested article topics">{topics.map((topic, i) => <div key={i}><p className="bw-eyebrow">TOPIC {String(i + 1).padStart(2, '0')}</p><h3>{topic.title}</h3><p>{topic.angle}</p><small>Suggested search phrase: {topic.keyword}</small><button type="button" className="bw-text-button" disabled={busy || active(job) || !canEdit} onClick={() => createFromTopic(topic)}>Write this article <ArrowUpRight size={15} /></button></div>)}</section>}
    <div className="bw-filters"><label className="bw-search"><Search size={17} /><input aria-label="Search articles" placeholder="Search article titles" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><select aria-label="Article status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">All articles</option><option value="draft">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
    {loading ? <p className="bw-note" role="status">Loading articles…</p> : listing.posts.length ? <div className="bw-post-list">{listing.posts.map(p => <button type="button" key={p.id} onClick={() => navigate(p.id)} className="bw-post-row"><span className="bw-post-icon"><FileText size={20} /></span><span className="bw-post-title"><strong>{p.title}</strong><small>/blog/{p.slug}</small></span><span className={`bw-badge bw-badge-${p.status}`}>{p.status}{p.status === 'published' && p.hasUnpublishedChanges ? ' · draft changes' : ''}</span><ChevronRight size={17} /></button>)}</div> : <div className="bw-empty"><BookOpen size={28} /><h3>{query ? 'No articles match your search.' : status === 'all' ? 'Your first article starts here.' : `No ${status} articles yet.`}</h3><p>Write something that helps a photographer with their next shoot or delivery.</p></div>}
    {listing.pages > 1 && <nav className="bw-pagination" aria-label="Article list pages"><button className="bw-button bw-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} />Previous</button><span>{page} / {listing.pages}</span><button className="bw-button bw-secondary" disabled={page >= listing.pages} onClick={() => setPage(p => p + 1)}>Next<ChevronRight size={16} /></button></nav>}
  </motion.div>;
  if (!form) return <div className="bw-workspace"><button className="bw-text-button" onClick={() => navigate()}><ArrowLeft size={16} />All articles</button>{errorPanel}<p className="bw-note" role="status">{error ? 'The article could not be opened.' : 'Opening article…'}</p></div>;
  const checks = dirty ? null : post.checks;
  const previewPost = { ...form.draft, ...(preview || { bodyHtml: post.draft.bodyHtml, toc: post.draft.toc, readingMinutes: post.draft.readingMinutes }), publishedAt: null, updatedAt: null, cover: coverUrl ? { src: coverUrl, srcSet: `${coverUrl} 960w`, width: 960, height: 640 } : null };
  return <motion.div className="bw-workspace" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <div className="bw-editor-top"><button type="button" className="bw-text-button" onClick={() => navigate()}><ArrowLeft size={16} />All articles</button><div className="bw-actions"><span className={`bw-badge bw-badge-${post.status}`}>{post.status}</span>{dirty && <span className="bw-unsaved">Unsaved changes</span>}{canEdit && <button type="button" className="bw-button bw-secondary" disabled={locked || !dirty} onClick={saveClick}><Save size={15} />Save draft</button>}{post.status === 'published' && <a className="bw-text-button" href={`https://veylo.com.ng/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">View live<ArrowUpRight size={14} /></a>}</div></div>
    {errorPanel}{notice && <p className="bw-message" role="status">{notice}</p>}{jobPanel}
    <div className="bw-editor-layout"><div className="bw-writing"><fieldset disabled={locked}><legend className="bw-sr">Article content</legend><label className="bw-label">Article title<input value={form.draft.title} maxLength={180} placeholder="What will this article help a photographer do?" onChange={e => change('title', e.target.value)} /></label><label className="bw-label">Short introduction<textarea rows={3} maxLength={400} value={form.draft.excerpt} placeholder="A plain-English summary for the blog page." onChange={e => change('excerpt', e.target.value)} /></label></fieldset>
    <div className="bw-writing-tabs"><button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}><FileText size={15} />Write</button><button type="button" aria-pressed={view === 'preview'} disabled={busy} onClick={showPreview}><BookOpen size={15} />Preview</button></div>
    {view === 'write' ? <fieldset disabled={locked}><legend className="bw-sr">Article body</legend><div className="bw-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" onClick={() => format('\n## ')} aria-label="Add section heading"><Type size={16} />Heading</button><button type="button" onClick={() => format('**', '**')}>Bold</button><button type="button" onClick={() => format('\n- ')}><List size={16} />List</button><button type="button" onClick={() => format('[', '](/formats)')}>Link</button></div><label className="bw-sr" htmlFor="blog-markdown">Article text</label><textarea id="blog-markdown" ref={editor} className="bw-body-input" value={form.draft.markdown} maxLength={80000} onChange={e => change('markdown', e.target.value)} placeholder="Write your article here, or add a topic and use Write with AI. Use ## for section headings." /><p className="bw-note">Markdown is supported. Section headings, lists, links and bold text are available above.</p></fieldset> : <div className="bw-preview" onClick={previewLink} dangerouslySetInnerHTML={{ __html: renderBlogArticle(previewPost) }} />}
    <fieldset disabled={locked} className="bw-cover-section"><legend className="bw-label">Cover photo</legend><p className="bw-note">Use a Veylo demo photo or upload your own. The cover combines your photograph with the article title and Veylo colours. Your original stays unchanged.</p><button type="button" className="bw-button bw-secondary" disabled={!form.draft.title.trim()} onClick={() => generateCover()}><Image size={16} />Update cover design</button><CoverPhotoChooser onSelect={generateCover} disabled={!form.draft.title.trim()} /><CoverPreview id={form.draft.coverId} onUrl={setCoverUrl} /><label className="bw-upload"><Image size={20} /><span>{form.draft.coverId ? 'Use your own photo' : 'Upload a cover photo'}<small>JPEG, PNG or WebP · up to 5 MB</small></span><input aria-label="Upload cover photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!form.draft.title.trim()} onChange={e => { uploadCover(e.target.files?.[0]); e.target.value = ''; }} /></label>{form.draft.coverId && <button type="button" className="bw-text-button" onClick={() => change('coverId', null)}>Remove cover</button>}<label className="bw-label">Photo description (alt text)<input value={form.draft.coverAlt} maxLength={300} placeholder="Describe what is visible in the photo." onChange={e => change('coverAlt', e.target.value)} /></label><label className="bw-label">Photo credit (optional)<input value={form.draft.coverCredit} maxLength={180} placeholder="Photograph by…" onChange={e => change('coverCredit', e.target.value)} /></label></fieldset>
    </div><aside className="bw-sidebar"><section className="bw-panel"><h3><FileText size={17} />Writing brief</h3><fieldset disabled={locked}><legend className="bw-sr">AI writing brief</legend><p className="bw-note">The article title is your topic. Add examples and a useful angle below.</p><label className="bw-label">Target search phrase<input value={form.draft.keyword} maxLength={150} placeholder="e.g. how to deliver wedding photos" onChange={e => change('keyword', e.target.value)} /></label><label className="bw-label">Your notes<textarea rows={5} value={form.notes} maxLength={12000} placeholder="What should the article cover? What needs correcting?" onChange={e => change('notes', e.target.value, false)} /></label><button type="button" className="bw-button bw-secondary" disabled={!form.draft.title.trim() || active(job) || !listing.aiConfigured} onClick={() => startGeneration('article', Boolean(form.draft.markdown.trim()))}><RefreshCw size={15} />{form.draft.markdown.trim() ? 'Rewrite article' : 'Write with AI'}</button>{form.draft.markdown.trim() && <p className="bw-note">Rewrite the title, article, SEO fields and cover design in one click.{post.status === 'published' ? ' Review the new draft, then choose Publish update to put it live.' : ''}</p>}</fieldset></section>
    <section className="bw-panel"><h3><Search size={17} />Search appearance</h3><fieldset disabled={locked}><legend className="bw-sr">SEO fields</legend><label className="bw-label">Article URL<input value={form.slug} maxLength={120} disabled={Boolean(post.firstPublishedAt)} onChange={e => change('slug', e.target.value, false)} /><small>/blog/{form.slug}</small></label><label className="bw-label">SEO title<input value={form.draft.seoTitle} maxLength={100} onChange={e => change('seoTitle', e.target.value)} /><small>{form.draft.seoTitle.length} characters</small></label><label className="bw-label">Meta description<textarea rows={4} maxLength={250} value={form.draft.metaDescription} onChange={e => change('metaDescription', e.target.value)} /><small>{form.draft.metaDescription.length} characters</small></label></fieldset><div className="bw-search-preview"><span>veylo.com.ng › blog</span><strong>{form.draft.seoTitle || form.draft.title || 'Your article title'}</strong><p>{form.draft.metaDescription || 'Your article description will appear here.'}</p></div><p className="bw-note">Preview only. Search engines can choose different text and formatting.</p>{checks ? <div className="bw-checks">{checks.errors.map(text => <p key={text} className="bw-check-error">{text}</p>)}{checks.warnings.map(text => <p key={text}>{text}</p>)}{!checks.errors.length && <p className="bw-check-ok"><Check size={14} />Required fields are complete.</p>}</div> : <p className="bw-note">Save your draft to refresh the checks.</p>}</section>
    <section className="bw-panel bw-publish"><h3><ArrowUpRight size={17} />Publication</h3>{post.status === 'archived' ? <><p className="bw-note">This article is archived and is not visible on Veylo.</p>{canEdit && <button className="bw-button" disabled={busy} onClick={() => lifecycle('restore')}>Restore as draft</button>}</> : <><p className="bw-note">{post.status === 'published' ? 'Draft edits become public only when you publish the update.' : 'Publish when the article is useful, accurate and ready for readers.'}</p>{canEdit && <><label className="bw-review"><input type="checkbox" checked={reviewed} disabled={locked || dirty} onChange={e => setReviewed(e.target.checked)} /><span>I have reviewed the article, checked its facts, and have permission to publish the photos.</span></label><button type="button" className="bw-button" disabled={locked || dirty || !reviewed || Boolean(checks?.errors.length)} onClick={() => lifecycle('publish')}>{post.status === 'published' ? 'Publish update' : 'Publish article'}<ArrowUpRight size={15} /></button>{dirty && <p className="bw-note">Save your draft before publishing.</p>}<div className="bw-lifecycle">{post.status === 'published' && <button className="bw-text-button" disabled={locked || dirty} onClick={() => setConfirmAction('unpublish')}>Unpublish</button>}<button className="bw-text-button" disabled={locked || dirty} onClick={() => setConfirmAction('archive')}>Archive article</button></div></>}</>}{confirmAction && <div className="bw-confirm" role="alert"><p>{confirmAction === 'archive' ? 'Archive this article? It will be removed from the public blog. You can restore it as a draft later.' : 'Unpublish this article? Readers will no longer be able to open it. The draft will be saved.'}</p><div className="bw-actions"><button className="bw-button bw-secondary" disabled={busy} onClick={() => lifecycle(confirmAction)}>Confirm {confirmAction}</button><button className="bw-text-button" onClick={() => setConfirmAction('')}>Keep article</button></div></div>}</section></aside></div>
  </motion.div>;
}
