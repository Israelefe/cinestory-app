import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, CheckCheck, FolderOpen, Send } from 'lucide-react';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';
import './LibraryWorkspace.css';

export default function LibraryShell({ title, description, children, action, eyebrow = 'YOUR STUDIO', compact = false }) {
  const reduced = useVeyloReducedMotion();
  return <div className={'lib-page' + (compact ? ' lib-page-compact' : '')}><div className="lib-wrap"><motion.header className="lib-header" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div><p><Camera size={13} />{eyebrow}</p><h1>{title}</h1>{description && <span>{description}</span>}</div>{action && <div className="lib-header-action">{action}</div>}</motion.header><nav className="lib-nav" aria-label="Photo workspaces"><NavLink to="/library" aria-label="Photo Library"><FolderOpen size={17} /><span className="lib-nav-full">Photo Library</span><span className="lib-nav-short" aria-hidden="true">Library</span></NavLink><NavLink to="/pre-selection" aria-label="Photo Pre-selection"><CheckCheck size={17} /><span className="lib-nav-full">Photo Pre-selection</span><span className="lib-nav-short" aria-hidden="true">Pre-selection</span></NavLink><NavLink to="/editor-links"><Send size={17} />Editor Links</NavLink></nav>{children}</div></div>;
}
