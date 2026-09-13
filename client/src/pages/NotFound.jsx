import React from 'react';
import { Page, Intro, Action } from '../components/PublicDesign.jsx';
export default function NotFound(){return <Page><Intro eyebrow="Page not found" title="This link doesn’t" accent="lead to a page." description="It may have moved, or the address may be incomplete."><div className="v-actions"><Action to="/">Back to Veylo</Action><Action to="/contact" secondary>Get help</Action></div></Intro></Page>;}
