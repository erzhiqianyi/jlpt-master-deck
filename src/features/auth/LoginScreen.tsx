// ログイン画面：Firebase の環境では Google ログイン、ローカルではユーザー名とパスワード。
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LoginLanding, LoginLanguageSelect } from './LoginLanding';
import type { Locale } from '../../types';

export function LoginScreen({
  firebase, onGoogle,
  error,
  loading,
  onSubmit,
  locale,
  onLocaleChange,
}: {
  error: string;
  loading: boolean;
  firebase: boolean;
  onGoogle: () => void;
  onSubmit: (mode: 'login' | 'register', username: string, password: string) => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const copy = locale === 'ja'
    ? { note: 'ローカル環境では、初回にユーザー名とパスワードを登録してください。', login: 'ログイン', register: '新規登録', username: 'ユーザー名', password: 'パスワード', processing: '処理中…', create: 'アカウントを作成', about: '学習コミュニティを見る（ログイン不要）', failed: 'ログインできませんでした。入力内容を確認してください。' }
    : locale === 'en'
      ? { note: 'Local installation: create a username and password the first time you use it.', login: 'Log in', register: 'Register', username: 'Username', password: 'Password', processing: 'Processing…', create: 'Create account', about: 'Explore the community (no sign-in)', failed: 'Could not sign in. Check your details and try again.' }
      : { note: '本地部署：首次使用请创建自己的账号密码。', login: '登录', register: '注册', username: '用户名', password: '密码', processing: '处理中…', create: '创建账号', about: '浏览学习社区（无需登录）', failed: '无法登录，请检查输入后重试。' };

  if (firebase) return <LoginLanding error={error} loading={loading} onGoogle={onGoogle} locale={locale} onLocaleChange={onLocaleChange}/>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(mode, username, password);
  }

  return (
    <main lang={locale} className="cute-shell light-workspace flex min-h-[100dvh] items-start justify-center px-5 py-10 text-[#28312d] sm:items-center sm:px-8 sm:py-12 lg:px-12">
      <section className="cute-card w-full max-w-md bg-transparent sm:max-w-[420px] sm:border sm:p-8 lg:max-w-sm">
        <div className="flex items-center justify-between gap-3"><h1 className="cute-brand text-2xl">JLPT Master</h1><LoginLanguageSelect locale={locale} onChange={onLocaleChange} /></div>

        <p className="mt-3 text-sm">{copy.note}</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <SegmentButton active={mode === 'login'} onClick={() => setMode('login')}>
            {copy.login}
          </SegmentButton>
          <SegmentButton active={mode === 'register'} onClick={() => setMode('register')}>
            {copy.register}
          </SegmentButton>
        </div>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-semibold text-[#654e58]">
            {copy.username}
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[#efd1db] bg-white/90 px-3 text-base outline-none focus:border-[#d95f8a]"
              autoComplete="username"
              pattern="[A-Za-z0-9_\-]{3,32}"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-[#654e58]">
            {copy.password}
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[#efd1db] bg-white/90 px-3 text-base outline-none focus:border-[#d95f8a]"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={4}
              required
            />
          </label>
          {error ? <p role="alert" className="rounded-2xl border border-[#f0cf80] bg-[#fff8df] p-3 text-sm font-semibold text-[#775516]">{copy.failed}</p> : null}
          <a href={`${locale === 'zh-CN' ? '' : `/${locale}`}/community/`} className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-2xl border border-[#efd1db] bg-white px-4 py-2 text-sm font-semibold text-[#654e58] hover:bg-[#fff0f5]">
            {copy.about}
          </a>
          <button type="submit" disabled={loading} className="cute-button-primary h-12 w-full rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? copy.processing : mode === 'register' ? copy.create : copy.login}
          </button>
        </form>
      </section>
    </main>
  );
}

function SegmentButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 min-w-0 rounded-md border px-3 py-2 text-sm font-semibold break-words ${
        active ? 'border-[#d95f8a] bg-[#d95f8a] text-white' : 'border-[#efd1db] bg-white text-[#654e58] hover:bg-[#fff0f5]'
      }`}
    >
      {children}
    </button>
  );
}

/** 未ログインで案内ページを開いたときは公開サイトへ移る。 */
export function PublicGuideRedirect({ target }: { target: string }) {
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return <main className="mx-auto max-w-xl p-8"><a href={target}>浏览 JLPT 社区</a></main>;
}
