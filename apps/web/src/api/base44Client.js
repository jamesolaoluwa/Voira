// NOTE: This project originally used the Base44 SDK which will redirect
// to Base44-hosted auth flows and assets. To avoid that behavior while
// migrating to your own backend (or Supabase), export a small stubbed
// client that provides the shapes the rest of the app expects. This
// prevents automatic redirects and keeps the app runnable.

// Lightweight stub implementing the methods the UI currently calls.
// Replace these implementations with real calls to your backend as you
// migrate functionality.
export const base44 = {
  auth: {
    // return null or a minimal user object; UI calls getMe via services/api
    me: async () => null,
  },
  entities: {
    UserProfile: {
      filter: async () => [],
      create: async (obj) => (obj || {}),
      update: async (id, patch) => ({ id, ...patch }),
    },
    Recording: {
      create: async (obj) => ({ id: 'stub-recording', ...obj }),
      list: async () => [],
      delete: async (id) => ({}),
      update: async (id, patch) => ({ id, ...patch }),
      filter: async () => [],
    },
    VoiceProfile: {
      list: async () => [],
      update: async (id, patch) => ({ id, ...patch }),
      create: async (obj) => ({ id: 'vp-stub', ...obj }),
    },
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => ({ file_url: null }),
      InvokeLLM: async (opts) => ({
        refined_draft: '',
        confidence_score: 75,
        clarity_score: 80,
        filler_count: 0,
      }),
    },
  },
};
