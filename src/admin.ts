import { addDoc, collection, getDoc, onSnapshot, query, updateDoc, doc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Listing, Profile } from './data';

export const reportReasons = ['Food safety', 'Misleading listing', 'Payment issue', 'Other'] as const;
export type ReportReason = typeof reportReasons[number];
export type Report = {
  id: string;
  reporterId: string;
  sellerId: string;
  listingId: string;
  foodName: string;
  reason: ReportReason;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: number;
  updatedAt: number;
};

export async function getAdminAccess(uid: string) {
  return (await getDoc(doc(db, 'admins', uid))).exists();
}

export function watchSellers(next: (items: Profile[]) => void, error: (error: Error) => void) {
  return onSnapshot(query(collection(db, 'users'), where('role', '==', 'seller')), snap => {
    next(snap.docs.map(item => item.data() as Profile).sort((a, b) => a.name.localeCompare(b.name)));
  }, error);
}

export function watchReports(next: (items: Report[]) => void, error: (error: Error) => void) {
  return onSnapshot(collection(db, 'reports'), snap => {
    next(snap.docs.map(item => ({ ...item.data(), id: item.id } as Report)).sort((a, b) => b.createdAt - a.createdAt));
  }, error);
}

export function watchAdminListings(next: (items: Listing[]) => void, error: (error: Error) => void) {
  return onSnapshot(collection(db, 'listings'), snap => {
    next(snap.docs.map(item => ({ ...item.data(), id: item.id } as Listing)).sort((a, b) => b.createdAt - a.createdAt));
  }, error);
}

export async function setSellerVerified(sellerId: string, verified: boolean) {
  await updateDoc(doc(db, 'users', sellerId), { verified });
}

export async function setListingVisible(listingId: string, active: boolean) {
  await updateDoc(doc(db, 'listings', listingId), { active });
}

export async function submitReport(reporter: Profile, listing: Listing, reason: ReportReason) {
  const now = Date.now();
  await addDoc(collection(db, 'reports'), {
    reporterId: reporter.id, sellerId: listing.sellerId, listingId: listing.id,
    foodName: listing.name, reason, status: 'open', createdAt: now, updatedAt: now,
  });
}

export async function setReportStatus(reportId: string, status: Report['status']) {
  await updateDoc(doc(db, 'reports', reportId), { status, updatedAt: Date.now() });
}
