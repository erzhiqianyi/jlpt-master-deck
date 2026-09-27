import * as openai from './providers/openai.mjs';
import * as googleCloud from './providers/google-cloud.mjs';
import * as azure from './providers/azure.mjs';

export const providers = [openai, googleCloud, azure];
export const providersById = Object.fromEntries(providers.map((provider) => [provider.id, provider]));
export const providerIds = providers.map((provider) => provider.id);

export function listProviderDescriptors() {
  return providers.map(({ id, name, requiresApiKey, credentialFields, voices, defaultVoice }) => ({
    id, name, requiresApiKey, credentialFields, voices, defaultVoice,
  }));
}
