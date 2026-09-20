import React from 'react';
import './DeliveryBrandMark.css';

function studioInitials(name) {
  const words = String(name || 'Studio').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'ST';
}

/**
 * A delivery-owned brand mark. Pro deliveries never use the Veylo mark as a
 * placeholder: when a studio has not uploaded a logo, its initials identify it
 * until the photographer adds one.
 */
export default function DeliveryBrandMark({ branding, className = '' }) {
  const studio = branding?.type === 'studio';
  const name = String(branding?.name || (studio ? 'Studio' : 'Veylo')).trim();
  const classes = `delivery-brand-mark${className ? ` ${className}` : ''}`;

  if (studio && !branding?.logoUrl) {
    return <span className={`${classes} delivery-brand-mark-initials`} aria-label={name}>{studioInitials(name)}</span>;
  }

  return <img className={classes} src={branding?.logoUrl || '/veylo/veylo-mark.svg'} alt={`${name} logo`} />;
}
