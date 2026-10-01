import { useCallback, useEffect, useRef, useState } from 'react';
import api, { apiMessage } from '../services/api.js';
import { editablePortfolio, normalizePortfolio, mediaUrl } from '../services/portfolio.js';
export function usePortfolioDraft() {
  const [form, setFormState] = useState(() => normalizePortfolio());
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const ref = useRef({
    form,
    saved: '',
    revision: 0,
    profile: null,
    flight: null,
    blocked: false,
    mounted: true,
    storageKey: ''
  });
  const setForm = useCallback(update => {
    const next = typeof update === 'function' ? update(ref.current.form) : update;
    ref.current.form = next;
    setFormState(next);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const {
        data
      } = await api.get('/v1/portfolios/mine');
      if (!ref.current.mounted) return;
      const next = normalizePortfolio(data.data);
      Object.assign(ref.current, {
        form: next,
        saved: JSON.stringify(editablePortfolio(next)),
        revision: data.draftRevision || 0,
        profile: data,
        blocked: false,
        storageKey: `veylo_portfolio_draft:${data.accountId || 'current'}`
      });
      setFormState(next);
      setProfile(data);
      setSaveState('saved');
      setSaveError('');
      setConflict(null);
      try {
        const stored = JSON.parse(sessionStorage.getItem(ref.current.storageKey) || 'null');
        if (stored && Date.now() - stored.savedAt < 86400000 && JSON.stringify(stored.form) !== ref.current.saved) setRecovery(stored);else sessionStorage.removeItem(ref.current.storageKey);
      } catch {}
    } catch (err) {
      if (ref.current.mounted) setError(apiMessage(err, 'We could not open your portfolio. Try again.'));
    } finally {
      if (ref.current.mounted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    ref.current.mounted = true;
    void load();
    return () => {
      ref.current.mounted = false;
    };
  }, [load]);
  const applyProfile = useCallback(data => {
    ref.current.profile = data;
    ref.current.revision = data.draftRevision || 0;
    const next = normalizePortfolio(data.data);
    ref.current.saved = JSON.stringify(editablePortfolio(next));
    setProfile(data);
    setForm(next);
    setSaveState('saved');
    try {
      sessionStorage.removeItem(ref.current.storageKey);
    } catch {}
  }, [setForm]);
  const flush = useCallback(async (all = true) => {
    const current = ref.current;
    if (current.flight) await current.flight;
    if (current.blocked || !current.profile || current.profile.access !== 'public') throw new Error('Review the saved draft before continuing.');
    const payload = editablePortfolio(current.form);
    const snapshot = JSON.stringify(payload);
    if (snapshot === current.saved) return current.revision;
    setSaveState('saving');
    setSaveError('');
    const flight = (async () => {
      try {
        const {
          data
        } = await api.put('/v1/portfolios/mine', {
          ...payload,
          expectedDraftRevision: current.revision
        });
        current.revision = data.draftRevision || 0;
        current.profile = data;
        const next = normalizePortfolio(data.data);
        current.saved = JSON.stringify(editablePortfolio(next));
        if (!current.mounted) return current.revision;
        setProfile(previous => ({
          ...previous,
          ...data
        }));
        if (JSON.stringify(editablePortfolio(current.form)) === snapshot) setForm(next);else setForm(value => ({
          ...value,
          items: value.items.map(item => {
            const saved = next.items.find(photo => photo.publicId === item.publicId);
            return saved ? {
              ...item,
              id: saved.id,
              url: saved.url,
              thumbnailUrl: saved.thumbnailUrl,
              srcSet: saved.srcSet,
              width: saved.width,
              height: saved.height
            } : item;
          })
        }));
        setSaveState('saved');
        if (JSON.stringify(editablePortfolio(current.form)) === current.saved) {
          try {
            sessionStorage.removeItem(current.storageKey);
          } catch {}
        }
        return current.revision;
      } catch (err) {
        if (current.mounted) {
          setSaveState('failed');
          setSaveError(apiMessage(err, 'Your latest changes could not be saved. Retry when you are connected.'));
          if (err.response?.status === 409) {
            current.blocked = true;
            setConflict(err.response.data.current || {
              message: 'Reload the latest draft to review it.'
            });
          }
        }
        throw err;
      } finally {
        current.flight = null;
      }
    })();
    current.flight = flight;
    const revision = await flight;
    if (all && JSON.stringify(editablePortfolio(current.form)) !== current.saved) return flush(true);
    return revision;
  }, [setForm]);
  const dirty = profile && JSON.stringify(editablePortfolio(form)) !== ref.current.saved;
  useEffect(() => {
    if (!dirty || loading || ref.current.blocked || profile?.access !== 'public') return;
    try {
      sessionStorage.setItem(ref.current.storageKey, JSON.stringify({
        form: editablePortfolio(form),
        revision: ref.current.revision,
        savedAt: Date.now()
      }));
    } catch {}
    const timer = setTimeout(() => {
      void flush(false).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [form, dirty, loading, profile?.access, flush]);
  useEffect(() => {
    const beforeUnload = event => {
      if (JSON.stringify(editablePortfolio(ref.current.form)) !== ref.current.saved || ref.current.flight) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const navigate = event => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || event.button || event.ctrlKey || event.metaKey || anchor.getAttribute('href')?.startsWith('#')) return;
      if (JSON.stringify(editablePortfolio(ref.current.form)) === ref.current.saved) return;
      event.preventDefault();
      event.stopPropagation();
      void flush().then(() => window.location.assign(anchor.href)).catch(() => {});
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigate, true);
    };
  }, [flush]);
  function restoreRecovery() {
    const next = normalizePortfolio(recovery.form);
    next.items = next.items.map(item => {
      const saved = ref.current.form.items.find(photo => photo.publicId === item.publicId);
      const url = saved?.url || mediaUrl(`/api/v1/portfolios/mine/source-media?publicId=${encodeURIComponent(item.publicId)}`);
      return {
        ...item,
        url,
        thumbnailUrl: saved?.thumbnailUrl || url,
        srcSet: saved?.srcSet,
        width: saved?.width,
        height: saved?.height
      };
    });
    ref.current.blocked = true;
    setForm(next);
    setRecovery(null);
    setConflict({
      recovery: true
    });
  }
  async function keepChanges() {
    try {
      const {
        data
      } = await api.get('/v1/portfolios/mine');
      const latest = normalizePortfolio(data.data);
      Object.assign(ref.current, {
        revision: data.draftRevision || 0,
        profile: data,
        saved: JSON.stringify(editablePortfolio(latest)),
        blocked: false
      });
      setProfile(data);
      setConflict(null);
      await flush();
    } catch (err) {
      setSaveError(apiMessage(err, 'Your changes could not be saved. Try again.'));
    }
  }
  return {
    form,
    setForm,
    profile,
    loading,
    error,
    load,
    dirty,
    saveState,
    saveError,
    conflict,
    recovery,
    restoreRecovery,
    dismissRecovery: () => {
      setRecovery(null);
      try {
        sessionStorage.removeItem(ref.current.storageKey);
      } catch {}
    },
    keepChanges,
    flush,
    applyProfile
  };
}
