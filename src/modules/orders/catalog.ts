/** Service pages that accept an order. Mirrors the service blocks in the frontend nav. */
const ORDERABLE_HREFS = new Set([
  "/photo/lr-basic",
  "/photo/lr-pro",
  "/photo/ps-basic",
  "/photo/ps-pro",
  "/photo/creative",
  "/photo/manipulation",
  "/photo/album",
  "/photo/social",
  "/photo/nde",
  "/video/classic",
  "/video/cinematic",
  "/video/motion",
  "/video/full-film-wedding",
  "/video/nde",
]);

export function isOrderablePath(pathname: string) {
  const clean = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return ORDERABLE_HREFS.has(clean);
}
