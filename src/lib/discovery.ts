import { apiRequest } from './api';
import { firebaseUser } from './firebase';

export type DiscoveryShare = { id: string; title: string; kind: 'practice' | 'wordbook'; description: string; count: number; mine: boolean };

export async function loadDiscoveryShares(token: string, cloud: boolean): Promise<DiscoveryShare[]> {
  if (!cloud) return (await apiRequest<{ shares: DiscoveryShare[] }>('/api/market', { token })).shares;
  const { listCloudShares } = await import('./cloudMarket');
  const identity = await apiRequest<{ uid: string | null }>('/api/auth/firebase/status', { token });
  const user = await firebaseUser();
  if (identity.uid !== user.uid) throw new Error('请到发现页连接当前账号的 Google 登录');
  return listCloudShares();
}
