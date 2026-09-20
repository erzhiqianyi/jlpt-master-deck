import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseApp, firebaseUser } from "./firebase";

type SharedPackage = {
  kind: string;
  title: string;
  description: string;
  questions?: unknown[];
  items?: unknown[];
};
const db = () => getFirestore(firebaseApp());
export async function listCloudShares() {
  const user = await firebaseUser();
  const snapshot = await getDocs(
    query(
      collection(db(), "jlptShares"),
      where("published", "==", true),
      limit(100),
    ),
  );
  return snapshot.docs.map((row) => {
    const data = row.data();
    return {
      id: row.id,
      title: data.title,
      kind: data.kind,
      description: data.description,
      count: data.count,
      mine: data.ownerUid === user.uid,
    };
  });
}
export async function publishCloudShare(pkg: SharedPackage) {
  const user = await firebaseUser();
  const ref = doc(collection(db(), "jlptShares"));
  await setDoc(ref, {
    ownerUid: user.uid,
    title: pkg.title,
    kind: pkg.kind,
    description: pkg.description,
    count: (pkg.questions || pkg.items || []).length,
    packageJson: JSON.stringify(pkg),
    published: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
export async function cloudShare(id: string) {
  await firebaseUser();
  const snapshot = await getDoc(doc(db(), "jlptShares", id));
  if (!snapshot.exists() || !snapshot.data().published)
    throw new Error("分享不存在或已撤回");
  return JSON.parse(snapshot.data().packageJson);
}
export async function withdrawCloudShare(id: string) {
  await firebaseUser();
  await updateDoc(doc(db(), "jlptShares", id), { published: false });
}
