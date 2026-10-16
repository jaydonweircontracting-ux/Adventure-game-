export type LiveUpdateStatus = 'available' | 'in-progress' | 'current';

/** Parse the authoritative BUILD marker embedded in prepare-build-entry.cjs. */
export function parseBuildMarker(source: string): number | null {
  const match = source.match(/__AG_BUILD.{0,8}?(\d{3,})/);
  if (!match) return null;
  const build = Number(match[1]);
  return Number.isSafeInteger(build) && build > 0 ? build : null;
}

/**
 * Compare the running client with both the deployed manifest and main's source.
 * Never report "current" if main has a newer build that has not reached Pages.
 */
export function determineUpdateStatus(
  runningBuild: number,
  deployedBuild: number,
  latestSourceBuild: number,
): LiveUpdateStatus {
  if (latestSourceBuild > runningBuild) {
    return deployedBuild >= latestSourceBuild ? 'available' : 'in-progress';
  }
  if (deployedBuild > runningBuild) return 'available';
  if (latestSourceBuild > deployedBuild) return 'in-progress';
  return 'current';
}
