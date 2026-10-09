import { MotionConfig } from 'framer-motion';
import { VEYLO_MOTION_CONFIG } from '../../client/src/utils/motionPolicy.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig {...VEYLO_MOTION_CONFIG}><App /></MotionConfig>
  </React.StrictMode>
);
