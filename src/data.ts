import { User } from 'firebase/auth';
import { collection, deleteField, doc, getDoc, onSnapshot, query, runTransaction, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export type Profile = { id: string; name: string; role: 'buyer' | 'seller'; shopName?: string; pickupLocation?: string; qrisUrl?: string; verified?: boolean };
export type Listing = { id: string; sellerId: string; sellerName: string; name: string; category: string; price: number; stock: number; description: string; images?: string[]; pickupLocation: string; preorderDeadline?: string; pickupTime?: string; active: boolean; createdAt: number; lastOrderId?: string };
export type Order = { id: string; buyerId: string; buyerName: string; sellerId: string; sellerName: string; listingId: string; foodName: string; unitPrice: number; quantity: number; total: number; pickupLocation: string; pickupTime?: string; purchaseType: 'online' | 'onsite'; status: 'pending_payment' | 'proof_submitted' | 'preparing' | 'ready' | 'completed' | 'cancelled'; proofId?: string; createdAt: number; updatedAt: number };

export async function createProfile(user: User, name: string, role: Profile['role']) {
  const profile: Profile = { id: user.uid, name: name.trim(), role };
  await setDoc(doc(db, 'users', user.uid), profile);
  return profile;
}

export async function getProfile(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() as Profile : null;
}

export function watchListings(next: (items: Listing[]) => void, error: (error: Error) => void) {
  return onSnapshot(query(collection(db, 'listings'), where('active', '==', true)), snap => {
    next(snap.docs.map(d => ({ ...d.data(), id: d.id } as Listing)).sort((a, b) => b.createdAt - a.createdAt));
  }, error);
}

export function watchSellerListings(uid: string, next: (items: Listing[]) => void, error: (error: Error) => void) {
  return onSnapshot(query(collection(db, 'listings'), where('sellerId', '==', uid)), snap => {
    next(snap.docs.map(d => ({ ...d.data(), id: d.id } as Listing)).sort((a, b) => b.createdAt - a.createdAt));
  }, error);
}

export function watchOrders(role: Profile['role'], uid: string, next: (items: Order[]) => void, error: (error: Error) => void) {
  const field = role === 'buyer' ? 'buyerId' : 'sellerId';
  return onSnapshot(query(collection(db, 'orders'), where(field, '==', uid)), snap => {
    next(snap.docs.map(d => ({ ...d.data(), id: d.id } as Order)).sort((a, b) => b.createdAt - a.createdAt));
  }, error);
}

export async function saveListing(seller: Profile, values: Pick<Listing, 'name' | 'category' | 'price' | 'stock' | 'description' | 'images' | 'pickupLocation' | 'preorderDeadline' | 'pickupTime'>, id?: string) {
  if (id) {
    await updateDoc(doc(db, 'listings', id), { ...values, sellerName: seller.shopName || seller.name });
    return id;
  }
  const listing = doc(collection(db, 'listings'));
  await setDoc(listing, { ...values, sellerId: seller.id, sellerName: seller.shopName || seller.name, active: true, createdAt: Date.now() });
  return listing.id;
}

export async function reserveOrder(buyer: Profile, listing: Listing, quantity: number, purchaseType: Order['purchaseType']) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Choose a valid quantity.');
  const listingRef = doc(db, 'listings', listing.id);
  const orderRef = doc(collection(db, 'orders'));
  await runTransaction(db, async tx => {
    const currentSnap = await tx.get(listingRef);
    if (!currentSnap.exists()) throw new Error('This food is no longer available.');
    const current = currentSnap.data() as Listing;
    if (!current.active || current.stock < quantity) throw new Error('Not enough portions are available.');
    if (current.preorderDeadline && Date.now() > Date.parse(current.preorderDeadline)) throw new Error('The pre-order deadline has passed.');
    const now = Date.now();
    tx.update(listingRef, { stock: current.stock - quantity, lastOrderId: orderRef.id });
    tx.set(orderRef, { buyerId: buyer.id, buyerName: buyer.name, sellerId: current.sellerId, sellerName: current.sellerName, listingId: listing.id, foodName: current.name, unitPrice: current.price, quantity, total: current.price * quantity, pickupLocation: current.pickupLocation, pickupTime: current.pickupTime || '', purchaseType, status: 'pending_payment', createdAt: now, updatedAt: now });
  });
  return orderRef.id;
}

function assertImageSize(dataUrl: string) {
  if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > 700000) {
    throw new Error('Choose a JPEG image under 500 KB for this no-billing pilot.');
  }
}

export async function submitProof(order: Order, dataUrl: string) {
  assertImageSize(dataUrl);
  const batch = writeBatch(db);
  batch.set(doc(db, 'proofs', order.id), { buyerId: order.buyerId, sellerId: order.sellerId, dataUrl });
  batch.update(doc(db, 'orders', order.id), { proofId: order.id, status: 'proof_submitted', updatedAt: Date.now() });
  await batch.commit();
}

export async function getProof(orderId: string) {
  const snapshot = await getDoc(doc(db, 'proofs', orderId));
  return snapshot.exists() ? snapshot.data().dataUrl as string : undefined;
}

export async function updateOrderStatus(order: Order, status: Order['status']) {
  await updateDoc(doc(db, 'orders', order.id), { status, updatedAt: Date.now() });
}

export async function cancelUnpaidOrder(order: Order) {
  const orderRef = doc(db, 'orders', order.id);
  const listingRef = doc(db, 'listings', order.listingId);
  await runTransaction(db, async tx => {
    const [currentOrder, currentListing] = await Promise.all([tx.get(orderRef), tx.get(listingRef)]);
    if (!currentOrder.exists() || currentOrder.data().status !== 'pending_payment') throw new Error('Only unpaid orders can be cancelled.');
    if (!currentListing.exists()) throw new Error('The food listing is missing. Contact the seller.');
    tx.update(orderRef, { status: 'cancelled', updatedAt: Date.now() });
    tx.update(listingRef, { stock: currentListing.data().stock + order.quantity, lastOrderId: order.id });
  });
}

export async function saveShop(profile: Profile, shopName: string, pickupLocation: string, qrisUri?: string | null): Promise<Profile> {
  if (qrisUri) assertImageSize(qrisUri);
  const qrisUrl = qrisUri === null ? undefined : qrisUri || profile.qrisUrl;
  const patch = { shopName: shopName.trim(), pickupLocation: pickupLocation.trim(), ...(qrisUri === null ? { qrisUrl: deleteField() } : qrisUrl ? { qrisUrl } : {}) };
  await updateDoc(doc(db, 'users', profile.id), patch);
  return { ...profile, shopName: shopName.trim(), pickupLocation: pickupLocation.trim(), qrisUrl };
}
