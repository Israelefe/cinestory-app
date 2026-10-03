export async function swipeGridBoardPhoto(page, dx, dy = 0, view = page) {
  const image = await view.locator('.pb-lightbox-photo').boundingBox();
  const x = image.x + image.width / 2;
  const y = Math.min(image.y + image.height / 2, page.viewportSize().height - 130);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}
