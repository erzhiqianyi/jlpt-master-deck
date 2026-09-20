import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
let auth: ReturnType<typeof getAuth> | undefined;
export function configureFirebase(config: FirebaseOptions) {
  auth ??= getAuth(initializeApp(config));
  auth.languageCode = "zh-CN";
}
export async function googleIdToken() {
  if (!auth) throw new Error("Firebase 登录尚未准备好");
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken();
}
export async function firebaseLogout() {
  if (auth) await signOut(auth);
}
export async function firebaseUser() {
  if (!auth) throw new Error("Firebase 尚未配置");
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("请先使用 Google 登录以访问云端市场");
  return auth.currentUser;
}
export function firebaseApp() {
  if (!auth) throw new Error("Firebase 尚未配置");
  return auth.app;
}
