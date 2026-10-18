## Authentication
- Use the managed Lovable OAuth helper directly from the sign-in control; validate its installed user and let the shared auth state navigate to avoid racing session hydration.
- Initial session reads must not overwrite newer auth events and must always settle the loading state, preventing stuck sign-in screens.