import { apiRequest } from './api';

export type DiscoveryShare = { id: string; title: string; kind: 'practice' | 'wordbook' | 'listening'; description: string; count: number; mine: boolean; categories?: string[]; cover?: string; level?: string; coverTitle?: string };

export async function loadDiscoveryShares(token: string): Promise<DiscoveryShare[]> {
  return (await apiRequest<{ shares: DiscoveryShare[] }>('/api/market', { token })).shares;
}
