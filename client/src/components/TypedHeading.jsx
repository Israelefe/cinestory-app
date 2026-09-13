import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

function TypedLine({ text, start, typedCount, reduced, accent }) {
  const characters = [...text].map((character, index) => {
    const position = start + index;
    const visible = reduced || position < typedCount;
    const hasCursor = !reduced && visible && position === typedCount - 1;

    return <span key={position} className={'v-type-character ' + (visible ? 'is-visible ' : '') + (hasCursor ? 'has-cursor' : '')}>{character === ' ' ? '\u00a0' : character}</span>;
  });

  return <span className="v-type-line" aria-hidden="true">{accent ? <em>{characters}</em> : <span>{characters}</span>}</span>;
}

export default function TypedHeading({ lines, className = '' }) {
  const reduced = useReducedMotion();
  const headlineLength = lines.reduce((total, line) => total + [...line.text].length, 0);
  const [typedCount, setTypedCount] = useState(0);
  const [typingForward, setTypingForward] = useState(true);

  useEffect(() => {
    if (reduced) {
      setTypedCount(headlineLength);
      return undefined;
    }

    const delay = typingForward
      ? (typedCount >= headlineLength ? 1800 : 55)
      : (typedCount <= 0 ? 400 : 30);
    const timer = window.setTimeout(() => {
      if (typingForward && typedCount >= headlineLength) setTypingForward(false);
      else if (!typingForward && typedCount <= 0) setTypingForward(true);
      else setTypedCount(count => count + (typingForward ? 1 : -1));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [headlineLength, reduced, typedCount, typingForward]);

  let start = 0;
  return <h1 className={'v-typed-heading ' + className} aria-label={lines.map(line => line.text).join(' ')}>{lines.map(line => {
    const lineStart = start;
    start += [...line.text].length;
    return <TypedLine key={line.text} text={line.text} start={lineStart} typedCount={typedCount} reduced={reduced} accent={line.accent} />;
  })}</h1>;
}
