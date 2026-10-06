import { apiRequest } from './api';

export type DiscoveryShare = { id: string; title: string; kind: 'practice' | 'wordbook' | 'listening'; description: string; count: number; mine: boolean; categories?: string[]; cover?: string; coverUrl?: string; level?: string; coverTitle?: string };

export async function loadDiscoveryShares(token: string, mineOnly = false): Promise<DiscoveryShare[]> {
  return (await apiRequest<{ shares: DiscoveryShare[] }>(mineOnly ? '/api/market?mine=1' : '/api/market', { token })).shares;
}
