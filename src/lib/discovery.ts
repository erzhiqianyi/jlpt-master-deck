import { apiRequest } from './api';

export type DiscoveryShare = { id: string; title: string; kind: 'practice' | 'wordbook'; description: string; count: number; mine: boolean };

export async function loadDiscoveryShares(token: string): Promise<DiscoveryShare[]> {
  return (await apiRequest<{ shares: DiscoveryShare[] }>('/api/market', { token })).shares;
}
