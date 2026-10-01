import React from 'react';
import { RotateCcw } from 'lucide-react';
import './DeliveryWritingReview.css';

const label = key => key === 'openingLine' ? 'Opening words' : key === 'closingLine' ? 'Closing words' : key === 'editorial.introduction' ? 'Feature introduction' : key.endsWith(':title') ? 'Section heading' : 'Section paragraph';
export default function DeliveryWritingReview({ suggestions, onUse, onKeep, undo, onUndo, pending, error, onRetry }) {
  if (!suggestions.length && !undo && !pending && !error) return null;
  return <section className="v3-panel delivery-writing-review" aria-label="Photo wording review">
    {pending && <p role="status">Checking the wording for the new photo order…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Retry wording review</button></div>}
    {undo && <button type="button" disabled={pending} onClick={onUndo}><RotateCcw size={16} />Undo photo change</button>}
    {suggestions.length > 0 && <><h3>Review the wording you edited.</h3><p>The photographs changed. Your text has been kept; these suggestions may fit the updated delivery better.</p></>}
    {suggestions.map(item => <article key={item.key}><strong>{item.label || label(item.key)}</strong><div><span>Your text</span><p>{item.previous || 'No text'}</p></div><div><span>Suggested text</span><p>{item.text || 'Leave this paragraph empty'}</p></div><footer><button type="button" disabled={pending} onClick={() => onUse(item)}>Use suggested text</button><button type="button" disabled={pending} onClick={() => onKeep(item)}>Keep my text</button></footer></article>)}
  </section>;
}
