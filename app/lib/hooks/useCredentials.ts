import { toast } from 'react-toastify';
import Cookies from 'js-cookie';
import type { GitAuth } from 'isomorphic-git';

let masterKey: CryptoKey | null = null;

const generateRandomKey = (): Uint8Array => {
  return crypto.getRandomValues(new Uint8Array(32));
};

const isEncryptionInitialized = (): boolean => {
  return masterKey !== null;
};

const initializeMasterKey = async (): Promise<boolean> => {
  try {
    const storedKey = localStorage.getItem('masterKey');

    let keyData: Uint8Array;

    if (storedKey) {
      keyData = new Uint8Array(
        atob(storedKey)
          .split('')
          .map((c) => c.charCodeAt(0)),
      );
    } else {
      keyData = generateRandomKey();
      localStorage.setItem('masterKey', btoa(String.fromCharCode(...keyData)));
    }

    masterKey = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt', 'decrypt']);

    return true;
  } catch (error) {
    console.error('Failed to initialize master key:', error);
    return false;
  }
};

const encrypt = async (text: string): Promise<string> => {
  if (!masterKey) {
    throw new Error('Master key not initialized');
  }

  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = encoder.encode(text);

  const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, encodedText);

  const encryptedArray = new Uint8Array(encryptedData);
  const combinedArray = new Uint8Array(iv.length + encryptedArray.length);
  combinedArray.set(iv);
  combinedArray.set(encryptedArray, iv.length);

  return btoa(String.fromCharCode(...combinedArray));
};

const decrypt = async (encryptedText: string): Promise<string> => {
  if (!masterKey) {
    throw new Error('Master key not initialized');
  }

  try {
    const decoder = new TextDecoder();
    const encryptedArray = new Uint8Array(
      atob(encryptedText)
        .split('')
        .map((char) => char.charCodeAt(0)),
    );

    const iv = encryptedArray.slice(0, 12);
    const encryptedData = encryptedArray.slice(12);

    const decryptedData = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, masterKey, encryptedData);

    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
};

const ensureEncryption = async (): Promise<boolean> => {
  if (!isEncryptionInitialized()) {
    return await initializeMasterKey();
  }

  return true;
};

const getDomain = (url: string): string => {
  const withoutProtocol = url.replace(/^https?:\/\//, '');
  return withoutProtocol.split(/[/?#]/)[0];
};

const getLegacyCredentials = async (domain: string): Promise<GitAuth | null> => {
  const provider = domain.split('.')[0];
  const encryptedUsername = Cookies.get(`${provider}Username`);
  const encryptedToken = Cookies.get(`${provider}Token`);

  if (!encryptedUsername || !encryptedToken) {
    return null;
  }

  try {
    const username = await decrypt(encryptedUsername);
    const token = await decrypt(encryptedToken);

    if (!username || !token) {
      Cookies.remove(`${provider}Username`);
      Cookies.remove(`${provider}Token`);

      return null;
    }

    return { username, password: token };
  } catch (error) {
    console.error('Failed to decrypt legacy credentials:', error);

    const provider = domain.split('.')[0];
    Cookies.remove(`${provider}Username`);
    Cookies.remove(`${provider}Token`);

    return null;
  }
};

const migrateLegacyCredentials = async (domain: string, auth: GitAuth): Promise<boolean> => {
  const provider = domain.split('.')[0];

  try {
    const encryptedCreds = await encrypt(JSON.stringify(auth));
    Cookies.set(domain, encryptedCreds);

    Cookies.remove(`${provider}Username`);
    Cookies.remove(`${provider}Token`);

    const legacyKeys = [
      `${provider}AccessToken`,
      `${provider}Auth`,
      `${provider}Credentials`,
      `${provider}_username`,
      `${provider}_token`,
    ];

    legacyKeys.forEach((key) => {
      if (Cookies.get(key)) {
        Cookies.remove(key);
        console.log(`Removed legacy cookie: ${key}`);
      }
    });

    console.log(`Successfully migrated ${provider} credentials to new format and cleaned up legacy data`);

    return true;
  } catch (error) {
    console.error('Failed to migrate legacy credentials:', error);
    return false;
  }
};

const getNewFormatCredentials = async (domain: string): Promise<GitAuth | null> => {
  const encryptedCreds = Cookies.get(domain);

  if (!encryptedCreds) {
    return null;
  }

  try {
    const decryptedCreds = await decrypt(encryptedCreds);
    const { username, password } = JSON.parse(decryptedCreds);

    if (!username || !password) {
      Cookies.remove(domain);
      return null;
    }

    return { username, password };
  } catch (error) {
    console.error('Failed to parse or decrypt Git Cookie:', error);
    Cookies.remove(domain);

    return null;
  }
};

const lookupSavedPassword = async (url: string): Promise<GitAuth | null> => {
  if (!(await ensureEncryption())) {
    return null;
  }

  const domain = getDomain(url);

  const newFormatCreds = await getNewFormatCredentials(domain);

  if (newFormatCreds) {
    return newFormatCreds;
  }

  const legacyCreds = await getLegacyCredentials(domain);

  if (legacyCreds) {
    const migrationSuccess = await migrateLegacyCredentials(domain, legacyCreds);

    if (migrationSuccess) {
      return legacyCreds;
    }
  }

  return null;
};

const saveGitAuth = async (url: string, auth: GitAuth) => {
  if (!(await ensureEncryption())) {
    toast.error('Failed to initialize encryption');
    return;
  }

  const domain = getDomain(url);

  if (!auth.username || !auth.password) {
    toast.error('Username and token are required');
    return;
  }

  try {
    const encryptedCreds = await encrypt(
      JSON.stringify({
        username: auth.username,
        password: auth.password,
      }),
    );
    Cookies.set(domain, encryptedCreds);
    toast.success(`${domain} credentials saved successfully!`);
  } catch (error) {
    console.error('Failed to encrypt credentials:', error);
    toast.error('Failed to save credentials securely');
  }
};

export { lookupSavedPassword, saveGitAuth, isEncryptionInitialized, ensureEncryption };
