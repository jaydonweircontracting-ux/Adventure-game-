# Self-Healing Execution Protocol

**Status:** Implemented as documented workflow (no runtime hooks available in agent environment).

The agent runs in conversational turns, not as a persistent daemon. There are no
lifecycle hooks to install. Recovery is implemented through:

1. This documented protocol (standing operating procedure)
2. `scripts/safe-run.mjs` — wrapper with retry logic for commands
3. Agent discipline: diagnose before retrying, max 3 attempts per strategy

## Protocol: OBSERVE → EXECUTE → VERIFY → DIAGNOSE → RECOVER → RETRY

### Failed File Edits
1. Stop repeating the identical failed edit
2. Capture the complete error
3. Reread the file from disk (30-40 lines context)
4. Identify why it failed (text mismatch, file changed, wrong path)
5. Reconstruct the edit against current contents
6. Retry with precise method
7. After 3 failures, change strategy (smaller patch, different approach)
8. Verify: reread, check diff, run relevant test

### Failed Builds/Tests
1. Preserve failure output
2. Determine cause: app, test, environment, dependencies, infrastructure
3. Reproduce where practical
4. Make smallest justified correction
5. Rerun exact failing test, then regressions
6. Never weaken assertions to manufacture passes

### Failed Git Operations
1. Read error, inspect `git status`, inspect diffs
2. Identify cause: auth, connectivity, divergence, hooks, protection
3. For divergence: preserve local, fetch, reconcile (never force-push shared history)
4. For auth: stop retrying, document blocker, continue local work
5. Verify: commit exists, push confirmed by remote

### Failed Memory Writes
1. Reread target file
2. Update existing authoritative file (don't create duplicates)
3. Write smallest valid change
4. Read back and verify
5. Verify Git tracking separately

## Bounded Retries
- Max 3 attempts with same strategy, then reassess
- Transient failures (network blip): retry
- Hard blockers (missing creds, denied permission): stop, document, continue other work
- Never fabricate success to escape a retry loop

## Recovery Demonstration (BUILD 538)
- **Combat test failure:** Attack triggered but no damage (hp 40→40)
- **Diagnosis:** Player not facing goat; attack requires target in facing arc
- **Recovery:** Added facing step (tap ArrowRight) before attack
- **Verification:** Reran test → 9/9 pass, damage 40→31 confirmed
- **Result:** Genuine defect in test (not game), fixed and verified
