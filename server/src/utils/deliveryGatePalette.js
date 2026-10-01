// A locked link may reveal its colours, but never its photos or story content.
export function deliveryGatePalette(delivery) {
  const source = delivery?.kind === 'pinboard'
    ? delivery.pinboard?.palette
    : delivery?.creativeDirection?.palette || delivery?.theme;
  return Object.fromEntries(['background', 'surface', 'text', 'accent'].flatMap(key => {
    const value = source?.[key] || source?.[`${key}Color`];
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? [[key, value]] : [];
  }));
}
