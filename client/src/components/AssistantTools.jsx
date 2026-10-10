import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Check, ClipboardCheck, FileText, LoaderCircle, MessageCircle, PencilLine, RefreshCw } from 'lucide-react';
import api, { apiMessage } from '../services/api.js';
import { prepareAssistantSupport } from '../services/assistantSupport.js';

const titles = { 'delivery-title': 'Delivery title', caption: 'Photo caption', 'client-message': 'WhatsApp delivery message', 'portfolio-intro': 'Portfolio introduction' };
export default function AssistantTools({ session, state, surface, onMessage, onClose }) {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const [writing, setWriting] = useState(false);
  const [kind, setKind] = useState('delivery-title');
  const [assetId, setAssetId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const request = useRef(null);
  const accountRequest = useRef(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const isStudio = surface === 'studio';
  const deliveryId = state.enabled ? state.workflow.deliveryId : undefined;
  const scope = `${state.page}:${deliveryId || ''}:${state.enabled}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const facts = session?.requestContext();
  const options = state.page === '/portfolio/manage' ? ['portfolio-intro'] : workspace?.delivery?.status === 'published' ? ['client-message'] : state.workflow.kind === 'pinboard' ? ['delivery-title'] : ['delivery-title', 'caption'];
  const photoOptions = (workspace?.photos || []).filter(item => item.captionEditable);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); accountRequest.current?.abort(); };
  }, []);
  async function refreshWorkspace() {
    accountRequest.current?.abort();
    const controller = new AbortController();
    accountRequest.current = controller;
    const startedScope = currentScope.current;
    setLoading(true);
    try {
      const { data } = await api.post('/v1/assistant/workspace', { context: session?.requestContext() }, { signal: controller.signal });
      if (!controller.signal.aborted && mounted.current && startedScope === currentScope.current) setWorkspace(data.data || null);
    } catch (failure) { if (!controller.signal.aborted && mounted.current && startedScope === currentScope.current) setError(apiMessage(failure, 'Account details could not be checked. Try again.')); }
    finally { if (accountRequest.current === controller && mounted.current) setLoading(false); }
  }
  useEffect(() => {
    request.current?.abort(); lock.current = false; setWorking(''); setProposal(null); setConfirm(false); setWriting(false); setWorkspace(null); setError('');
    if (isStudio) refreshWorkspace();
  }, [scope, isStudio]);
  useEffect(() => { if (!options.includes(kind)) setKind(options[0]); }, [options.join('|'), kind]);
  async function task(name, callback) {
    if (lock.current) return;
    lock.current = true; setWorking(name); setError('');
    const controller = new AbortController();
    request.current = controller;
    const startedScope = scope;
    try { await callback(controller.signal, () => mounted.current && !controller.signal.aborted && startedScope === currentScope.current); }
    catch (failure) { if (!controller.signal.aborted && mounted.current && startedScope === currentScope.current) setError(apiMessage(failure, failure.message || 'This task could not finish. Try again.')); }
    finally { if (request.current === controller && mounted.current) { request.current = null; lock.current = false; setWorking(''); } }
  }
  function openDraft(id) {
    if (!/^[a-f0-9]{24}$/i.test(id || '')) return;
    if (state.workflow.unsaved && !window.confirm('Your open form has unsaved changes. Leave this page?')) return;
    navigate(`/create?draft=${id}`); onClose();
  }
  const check = () => task('check', async (signal, active) => {
    const { data } = await api.post('/v1/assistant/check', { deliveryId, context: session?.requestContext() }, { signal });
    if (active()) onMessage(`I checked the saved delivery.\n\n${(data.data?.checks || []).map(item => `- ${item.text}`).join('\n')}\n\nReview the relevant step in your draft. Publishing still uses the normal preview and approval flow.`);
  });
  const suggest = event => {
    event.preventDefault();
    task('writing', async (signal, active) => {
      const { data } = await api.post('/v1/assistant/writing', { kind, ...(kind !== 'portfolio-intro' ? { deliveryId } : {}), ...(kind === 'caption' ? { assetId } : {}), instruction }, { signal, timeout: 50000 });
      if (active()) { setProposal(data.data); setConfirm(false); setCopied(false); }
    });
  };
  const apply = () => task('apply', async (signal, active) => {
    const { data } = await api.post('/v1/assistant/writing/confirm', { confirmation: proposal.confirmation }, { signal });
    if (!active()) return;
    const message = await session.apply(data.data);
    if (active()) { onMessage(message); setProposal(null); setConfirm(false); setWriting(false); }
  });
  const copy = () => task('copy', async (_signal, active) => {
    const clientPath = proposal.kind === 'client-message' && /^\/d\/[a-zA-Z0-9_-]{20,100}$/.test(proposal.clientPath || '') ? new URL(proposal.clientPath, window.location.origin).toString() : '';
    await navigator.clipboard.writeText([proposal.text, clientPath].filter(Boolean).join('\n\n'));
    if (active()) setCopied(true);
  });
  return <section className="veylo-assistant-tools" aria-label="Workspace assistance">
    {isStudio && <details className="veylo-assistant-workspace"><summary>Account and drafts{loading ? <LoaderCircle size={14} className="veylo-assistant-spin" /> : <RefreshCw size={14} />}</summary>
      <button type="button" onClick={refreshWorkspace} disabled={loading}>Refresh account details</button>
      {workspace?.account && <p>{workspace.account.deliveriesRemaining === null ? `${workspace.account.deliveriesThisMonth} deliveries published this month · Pro` : `${workspace.account.deliveriesRemaining} deliveries remaining this month`}<br />{workspace.account.storageLimitBytes ? `${(workspace.account.storageUsedBytes / 1024 ** 3).toLocaleString('en-NG', { maximumFractionDigits: 2 })} / ${(workspace.account.storageLimitBytes / 1024 ** 3).toLocaleString('en-NG')} GB in Image Library` : 'Your current plan has no Image Library upload allowance.'}</p>}
      {(workspace?.drafts || []).map(draft => <button type="button" key={draft._id} onClick={() => openDraft(draft._id)}>{draft.title || ({ photoswap: 'PhotoSwap', pinboard: 'GridBoard', showcase: 'Showcase' }[draft.kind] + ' draft')}<ArrowUpRight size={14} /></button>)}
      {!loading && !workspace && <p>Account details are unavailable. Use Billing or Image Library to check them.</p>}
    </details>}
    <div className="veylo-assistant-tool-buttons">
      {isStudio && deliveryId && <button type="button" onClick={check} disabled={Boolean(working)}><ClipboardCheck size={16} />{working === 'check' ? 'Checking…' : 'Check delivery'}</button>}
      {isStudio && (deliveryId || state.page === '/portfolio/manage') && (state.workflow.kind !== 'video' || workspace?.delivery?.status === 'published') && <button type="button" onClick={() => { setWriting(value => !value); setProposal(null); setConfirm(false); }} disabled={Boolean(working)} aria-expanded={writing}><PencilLine size={16} />Writing help</button>}
      <button type="button" onClick={() => { if (state.workflow.unsaved && !window.confirm('Your open form has unsaved changes. Leave this page?')) return; prepareAssistantSupport(facts); navigate('/contact'); onClose(); }}><MessageCircle size={16} />Prepare support request</button>
    </div>
    {writing && <form onSubmit={suggest} className="veylo-assistant-writing">
      <label>Help me write<select aria-label="Writing task" value={kind} onChange={event => { setKind(event.target.value); setProposal(null); setConfirm(false); }}>{options.map(value => <option key={value} value={value}>{titles[value]}</option>)}</select></label>
      {kind === 'caption' && <label>Photograph<select aria-label="Caption photograph" required value={assetId} onChange={event => { setAssetId(event.target.value); setProposal(null); }}><option value="">Choose a photograph</option>{photoOptions.map(photo => <option key={photo.assetId} value={photo.assetId}>{photo.label}</option>)}</select></label>}
      <label>What should change?<textarea aria-label="Writing instruction" required minLength={3} maxLength={800} rows={3} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Keep it short and use the shoot details." /></label>
      <p>{kind === 'client-message' ? 'Uses the published delivery’s saved details. Review the message before sending it.' : 'Uses saved writing. Confirming replaces only the selected field in your open form.'}</p>
      <button type="submit" disabled={Boolean(working) || !instruction.trim() || (kind === 'caption' && !assetId)}><FileText size={16} />{working === 'writing' ? 'Preparing…' : 'Prepare suggestion'}</button>
    </form>}
    {proposal && <div className="veylo-assistant-proposal"><strong>{titles[proposal.kind]}</strong><p>{proposal.text}</p>
      {confirm ? <><p>Replace this field in your open draft form with the wording above? Other fields stay as they are. Review the normal save status afterwards.</p><div><button type="button" onClick={apply} disabled={Boolean(working)}><Check size={16} />{working === 'apply' ? 'Applying…' : 'Confirm apply'}</button><button type="button" onClick={() => setConfirm(false)} disabled={Boolean(working)}>Cancel</button></div></> : <div>
        {proposal.kind !== 'client-message' && session?.canApply(proposal.kind) && <button type="button" onClick={() => setConfirm(true)} disabled={Boolean(working)}>Apply to draft form</button>}
        <button type="button" onClick={copy} disabled={Boolean(working)}>{copied ? 'Copied' : proposal.kind === 'client-message' ? 'Copy message and link' : 'Copy wording'}</button>
      </div>}
    </div>}
    {error && <p className="veylo-assistant-tool-error" role="alert">{error}</p>}
  </section>;
}
