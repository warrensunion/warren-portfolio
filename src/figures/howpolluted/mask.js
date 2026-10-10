// Land or water at a point, read from HowPolluted's own land mask (public/howpolluted/globe/land-mask.png:
// 1024x512, equirectangular, white land and black sea and lakes, drawn from Natural Earth by its
// scripts/build-globe.mjs). This is a real lookup of that mask, nothing more: no live data and no /api.
// The demo point's ground and every globe click in the figure come from here.

// mask: { width, height, data } with RGBA bytes (as from getImageData). x = 0 at lon -180, y = 0 at lat +90.
// Longitude wraps (so lon 180, 315 or -225 all land on the map) and latitude clamps short of the poles.
export function groundAt(mask, lat, lon) {
  const { width, height, data } = mask;
  const la = Math.max(-89.999, Math.min(89.999, Number(lat) || 0));
  const lo = ((((Number(lon) || 0) + 180) % 360) + 360) % 360;
  const x = Math.min(width - 1, Math.max(0, Math.floor((lo / 360) * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - la) / 180) * height)));
  return data[(y * width + x) * 4] > 127 ? 'land' : 'water';
}

// Browser only: draws the mask once into a 2D canvas (never appended to the page) and keeps its pixels.
export async function loadMask(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`land mask: HTTP ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const { width, height } = bmp;
  const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  bmp.close?.();
  const { data } = g.getImageData(0, 0, width, height);
  return { width, height, data };
}
