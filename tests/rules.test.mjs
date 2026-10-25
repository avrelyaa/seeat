import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const doc = (firestore, path) => firestore.doc(path);
const getDoc = ref => ref.get();
const setDoc = (ref, data) => ref.set(data);
const updateDoc = (ref, data) => ref.update(data);
const runTransaction = (firestore, update) => firestore.runTransaction(update);

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'seeat-test',
  firestore: { rules, host: '127.0.0.1', port: 8081 },
});

test('marketplace rules enforce verified users, reserved stock, and cancellation', async () => {
  try {
    const buyer = env.authenticatedContext('buyer-1', { email: 'buyer@example.com', email_verified: true }).firestore();
    const seller = env.authenticatedContext('seller-1', { email: 'seller@example.com', email_verified: true }).firestore();
    const stranger = env.authenticatedContext('stranger', { email: 'stranger@example.com', email_verified: true }).firestore();
    const unverified = env.authenticatedContext('unverified', { email: 'bad@example.com', email_verified: false }).firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    const listingPath = 'listings/food-1';
    const orderPath = 'orders/order-1';
    await assertSucceeds(setDoc(doc(seller, 'users/seller-1'), { id: 'seller-1', name: 'Seller', role: 'seller' }));
    await assertSucceeds(setDoc(doc(buyer, 'users/buyer-1'), { id: 'buyer-1', name: 'Buyer', role: 'buyer' }));
    const listing = {
      campus: 'BINUS', sellerId: 'seller-1', sellerName: 'Shop', name: 'Rice bowl',
      category: 'Meals', price: 15000, stock: 3, description: 'Fresh rice bowl',
      pickupLocation: 'BINUS lobby', preorderDeadline: '', pickupTime: '',
      active: true, createdAt: 1,
    };
    await assertSucceeds(setDoc(doc(seller, listingPath), listing));
    await assertFails(getDoc(doc(anonymous, listingPath)));
    await assertFails(getDoc(doc(unverified, listingPath)));
    await assertSucceeds(getDoc(doc(buyer, listingPath)));
    await assertFails(updateDoc(doc(buyer, listingPath), { stock: 0 }));
    await assertFails(updateDoc(doc(stranger, listingPath), { price: 1 }));

    const order = {
      buyerId: 'buyer-1', buyerName: 'Buyer', sellerId: 'seller-1', sellerName: 'Shop',
      listingId: 'food-1', foodName: 'Rice bowl', unitPrice: 15000, quantity: 2,
      total: 30000, pickupLocation: 'BINUS lobby', pickupTime: '',
      purchaseType: 'online', status: 'pending_payment', createdAt: 2, updatedAt: 2,
    };
    await assertSucceeds(runTransaction(buyer, async tx => {
      const snap = await tx.get(doc(buyer, listingPath));
      assert.equal(snap.data().stock, 3);
      tx.update(doc(buyer, listingPath), { stock: 1, lastOrderId: 'order-1' });
      tx.set(doc(buyer, orderPath), order);
    }));
    assert.equal((await getDoc(doc(seller, listingPath))).data().stock, 1);
    await assertFails(updateDoc(doc(stranger, orderPath), { status: 'preparing', updatedAt: 3 }));
    await assertFails(updateDoc(doc(seller, orderPath), { status: 'preparing', updatedAt: 3 }));
    await assertSucceeds(runTransaction(buyer, async tx => {
      const [o, l] = await Promise.all([tx.get(doc(buyer, orderPath)), tx.get(doc(buyer, listingPath))]);
      assert.equal(o.data().status, 'pending_payment');
      tx.update(doc(buyer, orderPath), { status: 'cancelled', updatedAt: 3 });
      tx.update(doc(buyer, listingPath), { stock: l.data().stock + 2, lastOrderId: 'order-1' });
    }));
    assert.equal((await getDoc(doc(seller, listingPath))).data().stock, 3);
    await assertFails(updateDoc(doc(buyer, orderPath), { status: 'proof_submitted', proofUrl: 'fake', updatedAt: 4 }));

    const secondOrderPath = 'orders/order-2';
    await assertSucceeds(runTransaction(buyer, async tx => {
      const snap = await tx.get(doc(buyer, listingPath));
      tx.update(doc(buyer, listingPath), { stock: snap.data().stock - 1, lastOrderId: 'order-2' });
      tx.set(doc(buyer, secondOrderPath), {
        ...order, quantity: 1, total: 15000, createdAt: 4, updatedAt: 4,
      });
    }));
    const proofPath = 'proofs/order-2';
    const proof = { buyerId: 'buyer-1', sellerId: 'seller-1', dataUrl: 'data:image/jpeg;base64,AAAA' };
    await assertFails(setDoc(doc(stranger, proofPath), proof));
    await assertSucceeds((async () => {
      const batch = buyer.batch();
      batch.set(doc(buyer, proofPath), proof);
      batch.update(doc(buyer, secondOrderPath), { status: 'proof_submitted', proofId: 'order-2', updatedAt: 5 });
      return batch.commit();
    })());
    await assertFails(getDoc(doc(stranger, proofPath)));
    await assertSucceeds(getDoc(doc(seller, proofPath)));
    await assertFails(updateDoc(doc(buyer, secondOrderPath), { status: 'preparing', updatedAt: 6 }));
    await assertSucceeds(updateDoc(doc(seller, secondOrderPath), { status: 'preparing', updatedAt: 6 }));
    await assertSucceeds(updateDoc(doc(seller, secondOrderPath), { status: 'ready', updatedAt: 7 }));
    await assertSucceeds(updateDoc(doc(seller, secondOrderPath), { status: 'completed', updatedAt: 8 }));
  } finally {
    await env.cleanup();
  }
});
