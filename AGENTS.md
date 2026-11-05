## Authentication
- Use the managed Lovable OAuth helper directly from the sign-in control; validate its installed user and let the shared auth state navigate to avoid racing session hydration.
- Initial session reads must not overwrite newer auth events and must always settle the loading state, preventing stuck sign-in screens.
## Live voice call
- The /voice page uses the GPT Live relay (`src/lib/live-relay.server.ts`, dispatched from `src/server.ts` and the Vite plugin) — audio flows over WebRTC for human-like turn-taking; the relay verifies the user's session token before opening a paid session.
