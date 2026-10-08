import React from 'react';
import { MessageCircle } from 'lucide-react';
export default function AssistantEntry() {
  return <button type="button" className="veylo-assistant-entry" aria-label="Open Veylo Assistant" aria-haspopup="dialog" onClick={event => window.dispatchEvent(new CustomEvent('veylo:assistant-open', { detail: event.currentTarget }))}><MessageCircle size={17} aria-hidden="true" />Ask Veylo</button>;
}
