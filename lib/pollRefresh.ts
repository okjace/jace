/**
 * Polls `check` (a fetch against a GET-by-id route) until it reports the
 * write has landed, then calls `refresh`. The JSON-file store behind this
 * app sits on a CDN, so a read immediately after a write can briefly miss
 * it — this avoids refreshing a page into a stale render right after a
 * save, at the cost of the save button staying busy a little longer.
 * Gives up and refreshes anyway after the last attempt.
 */
export async function pollThenRefresh(
  check: () => Promise<boolean>,
  refresh: () => void,
): Promise<void> {
  const delays = [300, 600, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4000, 4000];
  for (const delay of delays) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (await check()) break;
  }
  refresh();
}
