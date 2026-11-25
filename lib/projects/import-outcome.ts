// What to tell someone after they cancel an import. Cancelling only stops
// the browser waiting: the server stops before saving if it notices in time,
// but a save that has already started still completes. The browser can't
// know which happened, so it reloads (twice, a moment apart, because the
// save may still be finishing) and words the message on what it saw. The
// saved project is always the truth; nothing is ever rolled back.
export function cancelledImportMessage(check: {
  // Both reloads succeeded.
  reloaded: boolean;
  versionBefore: number;
  versionAfter: number;
}): string {
  if (!check.reloaded) {
    return "Import stopped, but we couldn't check whether it had already saved anything. Reload the page to see your latest scenes before importing again.";
  }
  if (check.versionAfter > check.versionBefore) {
    return "The project was updated while the import was stopping, so the import may have finished. Check your scenes before importing again.";
  }
  return "Import cancelled. Nothing was changed.";
}
