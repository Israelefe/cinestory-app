import React from 'react';
import PinboardViewer from '../components/delivery/PinboardViewer.jsx';
import { GRIDBOARD_DEMO } from '../constants/deliveryDemoFixtures.js';
export default function PinboardDemo() { return <PinboardViewer delivery={GRIDBOARD_DEMO} demo />; }
