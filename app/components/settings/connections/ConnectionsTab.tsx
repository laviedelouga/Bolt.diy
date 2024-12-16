import React, { useState, useEffect } from 'react';
import { logStore } from '~/lib/stores/logs';
import { lookupSavedPassword, saveGitAuth, ensureEncryption } from '~/lib/hooks/useCredentials';

export default function ConnectionsTab() {
  const [credentials, setCredentials] = useState({
    github: { username: '', token: '' },
    gitlab: { username: '', token: '' },
  });
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    initializeEncryption();
  }, []);

  const initializeEncryption = async () => {
    const success = await ensureEncryption();

    if (success) {
      loadSavedCredentials();
    }
  };

  const loadSavedCredentials = async () => {
    for (const [, config] of Object.entries(providers)) {
      const auth = await lookupSavedPassword(config.url);

      if (auth?.username && auth?.password) {
        config.setCredentials(auth.username, auth.password);
      }
    }
  };

  const toggleProvider = (provider: string) => {
    setExpandedProviders((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  const providers = {
    github: {
      url: 'github.com',
      username: credentials.github.username,
      token: credentials.github.token,
      title: 'GitHub',
      instructions: 'Enter your GitHub username and personal access token.',
      tokenSetupSteps: [
        '1. Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)',
        '2. Generate new token (classic) with these scopes:',
        '   • repo (Full control of private repositories)',
        '   • workflow (Optional: Update GitHub Action workflows)',
        '3. Copy the generated token and paste it here',
      ],
      setCredentials: (username: string, token: string) =>
        setCredentials((prev) => ({
          ...prev,
          github: { username, token },
        })),
    },
    gitlab: {
      url: 'gitlab.com',
      username: credentials.gitlab.username,
      token: credentials.gitlab.token,
      title: 'GitLab',
      instructions: 'To set up GitLab access:',
      tokenSetupSteps: [
        '1. Go to GitLab.com → Profile Settings → Access Tokens',
        '2. Create a new token with these scopes:',
        '   • api (Full API access)',
        '   • write_repository (Read/write access)',
        '3. Copy the generated token and paste it here',
      ],
      setCredentials: (username: string, token: string) =>
        setCredentials((prev) => ({
          ...prev,
          gitlab: { username, token },
        })),
    },
  };

  const handleSaveConnection = async (provider: keyof typeof providers) => {
    const { url, username, token, title } = providers[provider];

    await saveGitAuth(url, {
      username,
      password: token,
    });

    logStore.logSystem(`${title} connection settings updated`, {
      username,
      hasToken: !!token,
    });
  };

  return (
    <div className="space-y-4">
      {/* Encryption status section remains the same */}

      {Object.entries(providers).map(([key, provider]) => (
        <div
          key={key}
          className="p-4 border border-bolt-elements-borderColor rounded-lg bg-bolt-elements-background-depth-3"
        >
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleProvider(key)}>
            <div className="flex items-center">
              <h3 className="text-lg font-medium text-bolt-elements-textPrimary">{provider.title} Connection</h3>
              {provider.username && (
                <span className="ml-2 text-sm text-bolt-elements-textSecondary">({provider.username})</span>
              )}
            </div>
            <div className="flex items-center">
              {provider.username && provider.token && (
                <div className="flex items-center mr-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                  <span className="text-sm text-bolt-elements-textSecondary">Connected</span>
                </div>
              )}
              <div className={`transform transition-transform ${expandedProviders[key] ? 'rotate-180' : ''}`}>
                <div className="i-ph:caret-down text-bolt-elements-textSecondary" />
              </div>
            </div>
          </div>

          {expandedProviders[key] && (
            <div className="mt-4">
              <div className="mb-4 p-3 bg-bolt-elements-background-depth-4 rounded border border-bolt-elements-borderColor">
                <p className="text-sm text-bolt-elements-textSecondary mb-2">{provider.instructions}</p>
                <ul className="text-sm text-bolt-elements-textSecondary space-y-1">
                  {provider.tokenSetupSteps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ul>
              </div>

              <div className="flex mb-4">
                <div className="flex-1 mr-2">
                  <label className="block text-sm text-bolt-elements-textSecondary mb-1">
                    {provider.title} Username:
                  </label>
                  <input
                    type="text"
                    value={provider.username}
                    onChange={(e) => provider.setCredentials(e.target.value, provider.token)}
                    className="w-full bg-white dark:bg-bolt-elements-background-depth-4 relative px-2 py-1.5 rounded-md focus:outline-none placeholder-bolt-elements-textTertiary text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-bolt-elements-textSecondary mb-1">Personal Access Token:</label>
                  <input
                    type="password"
                    value={provider.token}
                    onChange={(e) => provider.setCredentials(provider.username, e.target.value)}
                    className="w-full bg-white dark:bg-bolt-elements-background-depth-4 relative px-2 py-1.5 rounded-md focus:outline-none placeholder-bolt-elements-textTertiary text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
                  />
                </div>
              </div>
              <div className="flex">
                <button
                  onClick={() => handleSaveConnection(key as keyof typeof providers)}
                  className="bg-bolt-elements-button-primary-background rounded-lg px-4 py-2 mr-2 transition-colors duration-200 hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text"
                >
                  Save {provider.title} Connection
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
