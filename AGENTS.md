## Authentication
- Use the managed Lovable OAuth helper directly from the sign-in control; validate its installed user and let the shared auth state navigate to avoid racing session hydration.
- Initial session reads must not overwrite newer auth events and must always settle the loading state, preventing stuck sign-in screens.
## Live voice call
- The /voice page is a free chat-style call: browser SpeechRecognition + speechSynthesis on the device, replies from `/api/voice-chat` calling Gemini directly with GOOGLE_API_KEY — never the paid Lovable gateway, to avoid credit use.
