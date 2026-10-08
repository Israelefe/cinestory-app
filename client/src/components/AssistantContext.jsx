import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { createAssistantSession } from '../services/assistantSession.js';
import { clearAssistantSupportDraft } from '../services/assistantSupport.js';

const Context = createContext(null);
const empty = { page: '', workflow: {}, recent: [], enabled: true, revision: 0 };
export function AssistantContextProvider({ user, children }) {
  const session = useRef(null);
  session.current ||= createAssistantSession();
  const identity = user?.id || user?._id || 'guest';
  const previousIdentity = useRef(identity);
  const { pathname, search } = useLocation();
  useLayoutEffect(() => {
    if (identity !== previousIdentity.current) { session.current.reset(); clearAssistantSupportDraft(); previousIdentity.current = identity; }
    const params = new URLSearchParams(search);
    session.current.route(pathname, pathname === '/create' ? params.get('draft') : pathname === '/sharing' ? params.get('delivery') : undefined, pathname === '/create' ? params.get('type') : pathname === '/portfolio/manage' ? 'portfolio' : undefined);
  }, [identity, pathname, search]);
  return <Context.Provider value={session.current}>{children}</Context.Provider>;
}
export function useAssistantContext() {
  const session = useContext(Context);
  const state = useSyncExternalStore(session?.subscribe || (() => () => {}), session?.getSnapshot || (() => empty));
  return { session, state };
}
export function useAssistantWorkflow(facts, handlers = {}) {
  const session = useContext(Context);
  const key = JSON.stringify(facts);
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const wrapped = Object.fromEntries(Object.keys(latest.current).map(kind => [kind, proposal => latest.current[kind](proposal)]));
    session?.workflow(facts, wrapped);
  }, [session, key]);
}
