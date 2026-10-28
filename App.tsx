import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageSourcePropType, Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, onAuthStateChanged, reload, sendEmailVerification, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { auth, configured } from './src/firebase';
import { formatSchedule, SchedulePicker } from './src/SchedulePicker';
import { cancelUnpaidOrder, createProfile, getProfile, getProof, Listing, Order, Profile, reserveOrder, saveListing, saveShop, submitProof, updateOrderStatus, watchListings, watchOrders, watchSellerListings } from './src/data';
import { getAdminAccess, Report, reportReasons, setListingVisible, setReportStatus, setSellerVerified, submitReport, watchAdminListings, watchReports, watchSellers } from './src/admin';

const money = (n: number) => 'Rp' + n.toLocaleString('id-ID');
const categories = ['All', 'Meals', 'Snacks', 'Desserts', 'Drinks'];
const art = {
  cooking: require('./assets/foodies/girl-cooking.png') as ImageSourcePropType,
  noodle: require('./assets/foodies/noodle-soup.png') as ImageSourcePropType,
  ingredients: require('./assets/foodies/meal-ingredients.png') as ImageSourcePropType,
  online: require('./assets/foodies/online-order.png') as ImageSourcePropType,
  chef: require('./assets/foodies/chef-menu.png') as ImageSourcePropType,
  grocery: require('./assets/foodies/grocery-shopping.png') as ImageSourcePropType,
};
const foodPlaceholder = require('./assets/food-placeholder.png') as ImageSourcePropType;
const statuses: Record<Order['status'], string> = { pending_payment: 'Awaiting payment', proof_submitted: 'Proof submitted', preparing: 'Preparing', ready: 'Ready for pickup', completed: 'Completed', cancelled: 'Cancelled' };
const errorMessage = (e: unknown) => Alert.alert('Seeat', e instanceof Error ? e.message : String(e));
async function chooseImage() {
  const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (selected.canceled) return undefined;
  const asset = selected.assets[0];
  const scale = Math.min(1, 1000 / Math.max(asset.width, asset.height));
  const context = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) context.resize({ width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) });
  const saved = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  if (!saved.base64) throw new Error('Could not prepare this image. Try another one.');
  const dataUrl = 'data:image/jpeg;base64,' + saved.base64;
  if (dataUrl.length > 700000) throw new Error('This image is too large for the no-billing pilot. Choose a smaller image.');
  return dataUrl;
}
async function chooseFoodImage() {
  const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (selected.canceled) return undefined;
  const asset = selected.assets[0];
  for (const [edge, quality] of [[720, .65], [600, .5], [480, .4]]) {
    const scale = Math.min(1, edge / Math.max(asset.width, asset.height));
    const context = ImageManipulator.manipulate(asset.uri);
    if (scale < 1) context.resize({ width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) });
    const saved = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
    if (saved.base64 && saved.base64.length + 23 < 250000) return 'data:image/jpeg;base64,' + saved.base64;
  }
  throw new Error('This photo is too large. Try another image.');
}
function Button({ label, press, quiet = false, disabled = false }: { label: string; press: () => void; quiet?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" onPress={press} disabled={disabled} style={[s.button, quiet && s.quiet, disabled && { opacity: .5 }]}><Text style={[s.buttonText, quiet && { color: '#3B1831' }]}>{label}</Text></Pressable>; }
function Field({ label, value, change, hint = '', numeric = false, secret = false, maxLength }: { label: string; value: string; change: (v: string) => void; hint?: string; numeric?: boolean; secret?: boolean; maxLength?: number }) { return <View style={{ marginTop: 16 }}><Text style={s.label}>{label}</Text><TextInput style={s.input} value={value} onChangeText={change} placeholder={hint} placeholderTextColor="#A18E98" keyboardType={numeric ? 'number-pad' : 'default'} secureTextEntry={secret} maxLength={maxLength} autoCapitalize={label.toLowerCase().includes('email') ? 'none' : 'sentences'} /></View>; }
function Hero({ eyebrow, title, image, green = false }: { eyebrow: string; title: string; image: ImageSourcePropType; green?: boolean }) { return <View style={[s.hero, green && s.heroGreen]}><View style={s.heroCopy}><Text style={s.overline}>{eyebrow}</Text><Text style={s.heroTitle}>{title}</Text></View><Image source={image} style={s.heroArt} resizeMode="contain" /></View>; }
function FoodArt({ images = [], large = false }: { images?: string[]; large?: boolean }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const galleryWidth = Math.min(width - 48, 592);
  if (!large) return <Image source={images[0] ? { uri: images[0] } : foodPlaceholder} style={s.foodArt} resizeMode="cover" />;
  const slides = images.length ? images : [undefined];
  return <View style={[s.foodArtLarge, { width: galleryWidth }]}>
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / galleryWidth))}>
      {slides.map((uri, index) => <Image key={index} source={uri ? { uri } : foodPlaceholder} style={{ width: galleryWidth, height: 190 }} resizeMode="cover" />)}
    </ScrollView>
    {slides.length > 1 && <Text style={s.galleryCount}>{page + 1} / {slides.length}</Text>}
  </View>;
}

export default function App({ screen = 'discover' }: { screen?: 'discover' | 'orders' | 'listings' | 'shop' | 'admin' }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null), [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [adminAccess, setAdminAccess] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]), [orders, setOrders] = useState<Order[]>([]);
  const [verifiedSellers, setVerifiedSellers] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Listing | null>(null), [search, setSearch] = useState(''), [category, setCategory] = useState('All');
  async function run(action: () => Promise<void>) { setBusy(true); try { await action(); } catch (e) { errorMessage(e); } finally { setBusy(false); } }
  useEffect(() => onAuthStateChanged(auth, async u => { setReady(false); const p = u?.emailVerified ? await getProfile(u.uid).catch(() => null) : null; const access = u?.emailVerified ? await getAdminAccess(u.uid).catch(() => false) : false; setUser(u); setProfile(p); setAdminAccess(access); setReady(true); }), []);
  useEffect(() => { const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true)); const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false)); return () => { show.remove(); hide.remove(); }; }, []);
  useEffect(() => { if (!profile) return; const fail = (e: Error) => errorMessage(e); const a = profile.role === 'seller' ? watchSellerListings(profile.id, setListings, fail) : watchListings(setListings, fail); const b = watchOrders(profile.role, profile.id, setOrders, fail); return () => { a(); b(); }; }, [profile?.id, profile?.role]);
  useEffect(() => { if (profile?.role !== 'buyer') return; let active = true; Promise.all([...new Set(listings.map(item => item.sellerId))].map(async id => [id, Boolean((await getProfile(id))?.verified)] as const)).then(rows => { if (active) setVerifiedSellers(Object.fromEntries(rows)); }).catch(errorMessage); return () => { active = false; }; }, [listings, profile?.role]);
  useEffect(() => { if (screen === 'admin' && !adminAccess) router.replace('/'); else if (profile?.role === 'seller' && screen === 'discover') router.replace('/listings'); else if (profile?.role === 'buyer' && (screen === 'listings' || screen === 'shop')) router.replace('/'); }, [profile?.role, screen, adminAccess]);
  if (!configured) return <SafeAreaView style={s.page}><View style={s.center}><Text style={s.logo}>seeat.</Text><Text style={s.title}>Connect Firebase</Text><Text style={s.muted}>Add your Firebase project values to .env.</Text></View></SafeAreaView>;
  if (!ready) return <SafeAreaView style={s.page}><ActivityIndicator style={{ marginTop: 80 }} color="#D84F68" /></SafeAreaView>;
  if (!user) return <Auth run={run} busy={busy} />;
  if (!user.emailVerified) return <SafeAreaView style={s.page}><View style={s.center}><Text style={s.logo}>seeat.</Text><Text style={s.title}>Verify your email</Text><Text style={s.muted}>We sent a link to {user.email}. Open it, then return here.</Text><Button label="I've verified my email" disabled={busy} press={() => run(async () => { await reload(user); if (!auth.currentUser?.emailVerified) throw new Error('Your email is not verified yet.'); setProfile(await getProfile(user.uid)); setAdminAccess(await getAdminAccess(user.uid).catch(() => false)); })} /><Button label="Resend email" quiet press={() => run(() => sendEmailVerification(user))} /><Button label="Sign out" quiet press={() => signOut(auth)} /></View></SafeAreaView>;
  if (!profile) return <Setup user={user} run={run} busy={busy} done={setProfile} />;
  const seller = profile.role === 'seller';
  const admin = adminAccess;
  const visible = listings.filter(x => x.active && x.stock > 0 && (!x.preorderDeadline || Date.parse(x.preorderDeadline) > Date.now()) && (category === 'All' || x.category === category) && (x.name + x.sellerName).toLowerCase().includes(search.toLowerCase()));
  return <SafeAreaView style={s.page}><KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.shell}>
    <View style={s.header}><Text style={s.logo}>seeat<Text style={{ color: '#D84F68' }}>.</Text></Text><View style={s.headerRight}><Pressable onPress={() => signOut(auth)}><Text style={s.signOut}>Sign out</Text></Pressable></View></View>
    <ScrollView style={s.flex} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {screen === 'admin' ? admin ? <AdminDashboard run={run} busy={busy} /> : null : seller ? screen === 'listings' ? <SellerFoods profile={profile} items={listings} run={run} busy={busy} /> : screen === 'orders' ? <Orders items={orders} profile={profile} run={run} busy={busy} /> : <Shop profile={profile} run={run} busy={busy} done={setProfile} /> :
      screen === 'orders' ? <Orders items={orders} profile={profile} run={run} busy={busy} /> : <>
        <Hero eyebrow="FRESH FINDS" title={'Good food,\nclose by.'} image={art.noodle} />
        <TextInput style={[s.input, s.search]} value={search} onChangeText={setSearch} placeholder="Search food or seller" placeholderTextColor="#A18E98" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{categories.map(c => <Pressable key={c} onPress={() => setCategory(c)} style={[s.chip, c === category && s.chipOn]}><Text style={[s.chipText, c === category && { color: 'white' }]}>{c}</Text></Pressable>)}</ScrollView>
        <View style={s.sectionRow}><Text style={s.section}>Available now</Text><Text style={s.count}>{visible.length}</Text></View>
        {visible.map(x => <Pressable key={x.id} style={s.card} onPress={() => setSelected(x)}><FoodArt images={x.images} /><View style={s.cardCopy}><Text style={s.overline}>{x.category.toUpperCase()}</Text><Text numberOfLines={1} style={s.cardTitle}>{x.name}</Text><Text numberOfLines={1} style={s.muted}>{x.sellerName}{verifiedSellers[x.sellerId] ? ' · Verified' : ''}</Text><View style={s.cardBottom}><Text style={s.price}>{money(x.price)}</Text><Text style={s.green}>{x.stock} left</Text></View></View></Pressable>)}
        {!visible.length && <Empty text="Nothing here yet" />}
      </>}
    </ScrollView>
    {!keyboardVisible && <View style={s.nav}>{[...(seller ? [['listings', 'Menu'], ['orders', 'Orders'], ['shop', 'Shop']] : [['discover', 'Explore'], ['orders', 'Orders']]), ...(admin ? [['admin', 'Admin']] : [])].map(([key, label]) => <Pressable key={key} onPress={() => router.replace(key === 'discover' ? '/' : key === 'orders' ? '/orders' : key === 'listings' ? '/listings' : key === 'admin' ? '/admin' : '/shop')} style={[s.navItem, screen === key && s.navOn]}><Text style={[s.chipText, screen === key && { color: '#D84F68' }]}>{label}</Text></Pressable>)}</View>}
  </View>
  {selected && <ProductSheet item={selected} buyer={profile} verified={verifiedSellers[selected.sellerId]} run={run} busy={busy} close={() => setSelected(null)} ordered={() => { setSelected(null); router.push('/orders'); }} />}
  </KeyboardAvoidingView></SafeAreaView>;
}

function Empty({ text }: { text: string }) { return <View style={s.empty}><Image source={foodPlaceholder} style={s.emptyArt} resizeMode="cover" /><Text style={s.cardTitle}>{text}</Text></View>; }
function ProductSheet({ item, buyer, verified, run, busy, close, ordered }: { item: Listing; buyer: Profile; verified?: boolean; run: (f: () => Promise<void>) => void; busy: boolean; close: () => void; ordered: () => void }) {
  const [reporting, setReporting] = useState(false);
  return <View style={s.overlay}><ScrollView style={s.sheet} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
    <Pressable onPress={close}><Text style={s.link}>Close ×</Text></Pressable>
    <FoodArt images={item.images} large />
    <Text style={s.overline}>{item.category.toUpperCase()}</Text>
    <Text style={s.title}>{item.name}</Text>
    <Text style={s.muted}>by {item.sellerName}{verified ? ' · Verified seller' : ''}</Text>
    <Text style={s.price}>{money(item.price)}</Text>
    <View style={s.detailInfo}><Text style={s.body}>Pickup · {item.pickupLocation}</Text>{item.pickupTime ? <Text style={s.body}>{formatSchedule(item.pickupTime)}</Text> : null}{item.preorderDeadline ? <Text style={s.body}>Order by {formatSchedule(item.preorderDeadline)}</Text> : null}</View>
    <OrderForm item={item} buyer={buyer} run={run} busy={busy} done={ordered} />
    <Pressable onPress={() => setReporting(!reporting)} style={s.reportTrigger}><Text style={s.reportTriggerText}>Report listing</Text></Pressable>
    {reporting && <View style={s.reportChoices}>{reportReasons.map(reason => <Pressable key={reason} disabled={busy} style={s.reportChoice} onPress={() => run(async () => { await submitReport(buyer, item, reason); setReporting(false); Alert.alert('Report sent', 'Thanks for letting us know.'); })}><Text style={s.choiceText}>{reason}</Text></Pressable>)}</View>}
  </ScrollView></View>;
}
function Auth({ run, busy }: { run: (f: () => Promise<void>) => void; busy: boolean }) {
  const [register, setRegister] = useState(false), [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [role, setRole] = useState<Profile['role']>('buyer');
  return <SafeAreaView style={s.page}><KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={s.flex} contentContainerStyle={s.authContent} keyboardShouldPersistTaps="handled">
      <Text style={s.logo}>seeat<Text style={{ color: '#D84F68' }}>.</Text></Text>
      <View style={s.authHero}><View style={s.authHeroCopy}><Text style={s.overline}>SEE IT. CRAVE IT. EAT IT.</Text><Text style={s.authHeroTitle}>Find food worth craving.</Text></View><Image source={art.cooking} style={s.authArt} resizeMode="contain" /></View>
      <Text style={s.title}>{register ? 'Join Seeat' : 'Welcome back'}</Text>
      {register && <Field label="Name" value={name} change={setName} />}
      <Field label="Email" value={email} change={setEmail} hint="you@example.com" />
      <Field label="Password" value={password} change={setPassword} secret />
      {register && <View style={s.row}>{(['buyer', 'seller'] as const).map(x => <Pressable key={x} style={[s.choice, role === x && s.choiceOn]} onPress={() => setRole(x)}><Text style={[s.choiceText, role === x && s.choiceTextOn]}>{x === 'buyer' ? 'I want to eat' : 'I sell food'}</Text></Pressable>)}</View>}
      <Button label={register ? 'Create account' : 'Sign in'} disabled={busy} press={() => run(async () => { if (register) { if (!name.trim()) throw new Error('Enter your name.'); const r = await createUserWithEmailAndPassword(auth, email.trim(), password); await sendEmailVerification(r.user); if (typeof localStorage !== 'undefined') localStorage.setItem('seeat-pending', JSON.stringify({ name, role })); } else await signInWithEmailAndPassword(auth, email.trim(), password); })} />
      <Pressable onPress={() => setRegister(!register)}><Text style={[s.link, s.authLink]}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text></Pressable>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
function Setup({ user, run, busy, done }: { user: User; run: (f: () => Promise<void>) => void; busy: boolean; done: (p: Profile) => void }) {
  let pending: { name?: string; role?: Profile['role'] } = {}; try { if (typeof localStorage !== 'undefined') pending = JSON.parse(localStorage.getItem('seeat-pending') || '{}'); } catch {}
  const [name, setName] = useState(pending.name || ''), [role, setRole] = useState<Profile['role']>(pending.role || 'buyer');
  return <SafeAreaView style={s.page}><KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={s.flex} contentContainerStyle={s.setupContent} keyboardShouldPersistTaps="handled">
      <Image source={art.grocery} style={s.setupArt} resizeMode="contain" />
      <Text style={s.title}>One last thing</Text>
      <Field label="Your name" value={name} change={setName} />
      <View style={s.row}>{(['buyer', 'seller'] as const).map(x => <Pressable key={x} onPress={() => setRole(x)} style={[s.choice, role === x && s.choiceOn]}><Text style={[s.choiceText, role === x && s.choiceTextOn]}>{x === 'buyer' ? 'Buyer' : 'Seller'}</Text></Pressable>)}</View>
      <Button label="Continue" disabled={busy} press={() => run(async () => { if (!name.trim()) throw new Error('Enter your name.'); const p = await createProfile(user, name, role); if (typeof localStorage !== 'undefined') localStorage.removeItem('seeat-pending'); done(p); })} />
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
function OrderForm({ item, buyer, run, busy, done }: { item: Listing; buyer: Profile; run: (f: () => Promise<void>) => void; busy: boolean; done: () => void }) {
  const [quantity, setQuantity] = useState(1), [purchaseType, setPurchaseType] = useState<Order['purchaseType']>('online');
  return <View style={s.orderForm}>
    <View style={s.sectionRow}><Text style={s.label}>Portions</Text><View style={s.stepper}><Pressable accessibilityLabel="Remove one portion" disabled={quantity <= 1} onPress={() => setQuantity(quantity - 1)} style={s.stepButton}><Text style={s.stepText}>−</Text></Pressable><Text style={s.stepValue}>{quantity}</Text><Pressable accessibilityLabel="Add one portion" disabled={quantity >= item.stock} onPress={() => setQuantity(quantity + 1)} style={s.stepButton}><Text style={s.stepText}>+</Text></Pressable></View></View>
    <View style={s.row}>{(['online', 'onsite'] as const).map(kind => <Pressable key={kind} onPress={() => setPurchaseType(kind)} style={[s.choice, purchaseType === kind && s.choiceOn]}><Text style={[s.choiceText, purchaseType === kind && s.choiceTextOn]}>{kind === 'online' ? 'Pay before pickup' : 'Pay in person'}</Text></Pressable>)}</View>
    <View style={s.totalRow}><Text style={s.muted}>Total</Text><Text style={s.price}>{money(item.price * quantity)}</Text></View>
    <Button label="Reserve food" disabled={busy} press={() => run(async () => { await reserveOrder(buyer, item, quantity, purchaseType); done(); })} />
  </View>;
}
function Orders({ items, profile, run, busy }: { items: Order[]; profile: Profile; run: (f: () => Promise<void>) => void; busy: boolean }) {
  const seller = profile.role === 'seller'; const [qris, setQris] = useState<Record<string, string>>({}); const [proofImages, setProofImages] = useState<Record<string, string>>({});
  useEffect(() => { if (seller) return; Promise.all([...new Set(items.map(x => x.sellerId))].map(async id => [id, (await getProfile(id))?.qrisUrl || ''] as const)).then(rows => setQris(Object.fromEntries(rows))).catch(errorMessage); }, [items, seller]);
  useEffect(() => { Promise.all(items.filter(x => x.proofId).map(async x => [x.id, (await getProof(x.id)) || ''] as const)).then(rows => setProofImages(Object.fromEntries(rows))).catch(errorMessage); }, [items]);
  return <>
    <Hero eyebrow={seller ? 'SELLER DESK' : 'YOUR PICKUPS'} title={seller ? 'Incoming orders' : 'On your way'} image={art.online} />
    {seller ? <Text style={s.caution}>Confirm money arrived before preparing.</Text> : null}
    <View style={s.sectionRow}><Text style={s.section}>Orders</Text><Text style={s.count}>{items.length}</Text></View>
    {items.map(o => <View key={o.id} style={s.order}>
      <View style={s.orderTop}><View style={{ flex: 1 }}><Text style={s.cardTitle}>{o.foodName}</Text><Text style={s.muted}>{o.quantity} portions · {seller ? o.buyerName : o.sellerName}</Text></View><Text style={s.badge}>{statuses[o.status]}</Text></View>
      <View style={s.totalRow}><Text style={s.price}>{money(o.total)}</Text><Text style={s.muted}>{o.purchaseType === 'onsite' ? 'In person' : 'Prepaid'}</Text></View>
      <Text style={s.pickup}>Pickup · {o.pickupLocation}{o.pickupTime ? ' · ' + formatSchedule(o.pickupTime) : ''}</Text>
      {!seller && o.status === 'pending_payment' && <><Text style={s.label}>Seller QRIS</Text>{qris[o.sellerId] ? <Image source={{ uri: qris[o.sellerId] }} style={s.qris} resizeMode="contain" /> : <Text style={s.muted}>Seller QRIS is not available yet.</Text>}<Button label={o.purchaseType === 'onsite' ? 'Upload proof (optional)' : 'Upload payment proof'} disabled={busy} press={() => run(async () => { const uri = await chooseImage(); if (uri) await submitProof(o, uri); })} /><Button label="Cancel unpaid order" quiet disabled={busy} press={() => run(() => cancelUnpaidOrder(o))} /></>}
      {o.proofId && <><Text style={s.green}>Proof uploaded</Text>{proofImages[o.id] && <Image source={{ uri: proofImages[o.id] }} style={s.qris} resizeMode="contain" />}</>}
      {seller && (o.status === 'proof_submitted' || (o.status === 'pending_payment' && o.purchaseType === 'onsite')) && <Button label="Confirm payment" disabled={busy} press={() => run(() => updateOrderStatus(o, 'preparing'))} />}
      {seller && o.status === 'preparing' && <Button label="Mark ready" disabled={busy} press={() => run(() => updateOrderStatus(o, 'ready'))} />}
      {seller && o.status === 'ready' && <Button label="Complete order" disabled={busy} press={() => run(() => updateOrderStatus(o, 'completed'))} />}
    </View>)}
    {!items.length && <Empty text="No orders yet" />}
  </>;
}
function SellerFoods({ profile, items, run, busy }: { profile: Profile; items: Listing[]; run: (f: () => Promise<void>) => void; busy: boolean }) {
  const [edit, setEdit] = useState<Listing | null>(null), [open, setOpen] = useState(false);
  return <><Hero eyebrow="YOUR KITCHEN" title={'Food worth\nsharing.'} image={art.chef} green /><View style={s.sectionRow}><Text style={s.section}>Your menu</Text><Pressable onPress={() => { setEdit(null); setOpen(true); }}><Text style={s.addLink}>+ Add food</Text></Pressable></View>{open && <ListingEditor key={edit?.id || 'new'} profile={profile} item={edit} run={run} busy={busy} close={() => setOpen(false)} />}{items.map(x => <View key={x.id} style={s.card}><FoodArt images={x.images} /><View style={s.cardCopy}><Text style={s.overline}>{x.category.toUpperCase()}</Text><Text style={s.cardTitle}>{x.name}</Text><Text style={s.muted}>{x.stock} portions · {money(x.price)}</Text><Pressable onPress={() => { setEdit(x); setOpen(true); }}><Text style={s.editLink}>Edit food & stock →</Text></Pressable></View></View>)}{!items.length && <Empty text="Add your first food" />}</>;
}
function ListingEditor({ profile, item, run, busy, close }: { profile: Profile; item: Listing | null; run: (f: () => Promise<void>) => void; busy: boolean; close: () => void }) {
  const [name, setName] = useState(item?.name || ''), [category, setCategory] = useState(item?.category || 'Meals'), [price, setPrice] = useState(String(item?.price || '')), [stock, setStock] = useState(String(item?.stock ?? '')), [pickup, setPickup] = useState(item?.pickupLocation || profile.pickupLocation || ''), [deadline, setDeadline] = useState(item?.preorderDeadline || ''), [pickupTime, setPickupTime] = useState(item?.pickupTime || '');
  const [images, setImages] = useState<string[]>(item?.images || []);
  return <View style={s.editor}>
    <View style={s.sectionRow}><Text style={s.section}>{item ? 'Edit food' : 'Add food'}</Text><Pressable onPress={close}><Text style={s.link}>Close ×</Text></Pressable></View>
    <Image source={art.ingredients} style={s.editorArt} resizeMode="contain" />
    <Field label="Food name" value={name} change={setName} hint="What are you making?" />
    <Text style={s.label}>Photos · up to 3</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoStrip}>
      {(images.length ? images : [undefined]).map((uri, index) => <View key={index} style={s.photoTile}>
        <Image source={uri ? { uri } : foodPlaceholder} style={s.photoPreview} resizeMode="cover" />
        {uri && <Pressable accessibilityRole="button" onPress={() => setImages(images.filter((_, at) => at !== index))} style={s.photoRemove}><Text style={s.photoRemoveText}>Remove</Text></Pressable>}
      </View>)}
    </ScrollView>
    {images.length < 3 && <Button label="Add photo" quiet disabled={busy} press={() => run(async () => { const uri = await chooseFoodImage(); if (uri) setImages(current => current.length < 3 ? [...current, uri] : current); })} />}
    <Text style={s.label}>Category</Text><View style={s.row}>{categories.slice(1).map(c => <Pressable key={c} onPress={() => setCategory(c)} style={[s.chip, c === category && s.chipOn]}><Text style={[s.chipText, c === category && { color: 'white' }]}>{c}</Text></Pressable>)}</View>
    <View style={s.twoFields}><View style={{ flex: 1 }}><Field label="Price (Rp)" value={price} change={setPrice} numeric /></View><View style={{ flex: 1 }}><Field label="Portions" value={stock} change={setStock} numeric /></View></View>
    <Field label="Pickup spot" value={pickup} change={setPickup} hint="e.g. Main entrance" />
    <Text style={s.scheduleTitle}>Schedule · optional</Text><SchedulePicker label="Pickup time" value={pickupTime} onChange={setPickupTime} /><SchedulePicker label="Pre-order closes" value={deadline} onChange={setDeadline} />
    <Button label={item ? 'Save food' : 'Publish food'} disabled={busy} press={() => run(async () => { const p = Number(price), q = Number(stock); if (!name.trim() || !pickup.trim()) throw new Error('Add a food name and pickup spot.'); if (!Number.isInteger(p) || p <= 0 || !Number.isInteger(q) || q < 0) throw new Error('Check price and portions.'); if (pickupTime && Date.parse(pickupTime) <= Date.now()) throw new Error('Choose a future pickup time.'); if (deadline && Date.parse(deadline) <= Date.now()) throw new Error('Choose a future deadline.'); if (deadline && pickupTime && Date.parse(deadline) >= Date.parse(pickupTime)) throw new Error('Pre-orders must close before pickup.'); await saveListing(profile, { name: name.trim(), category, price: p, stock: q, description: item?.description || '', images, pickupLocation: pickup.trim(), pickupTime, preorderDeadline: deadline }, item?.id); close(); })} />
  </View>;
}
function Shop({ profile, run, busy, done }: { profile: Profile; run: (f: () => Promise<void>) => void; busy: boolean; done: (p: Profile) => void }) {
  const [name, setName] = useState(profile.shopName || ''), [pickup, setPickup] = useState(profile.pickupLocation || ''), [uri, setUri] = useState<string | undefined>();
  return <><Hero eyebrow="YOUR STOREFRONT" title={'Make it\nyours.'} image={art.grocery} /><Field label="Shop name" value={name} change={setName} /><Field label="Default pickup spot" value={pickup} change={setPickup} /><View style={s.qrisCard}><Text style={s.section}>Your QRIS</Text>{(uri || profile.qrisUrl) ? <Image source={{ uri: uri || profile.qrisUrl }} style={s.qris} resizeMode="contain" /> : <Text style={s.muted}>Add your QRIS for direct payment.</Text>}<Button label={uri || profile.qrisUrl ? 'Replace QRIS image' : 'Add QRIS image'} quiet press={() => run(async () => setUri(await chooseImage()))} /></View><Button label="Save shop" disabled={busy} press={() => run(async () => { if (!name.trim() || !pickup.trim()) throw new Error('Add a shop name and pickup spot.'); done(await saveShop(profile, name, pickup, uri)); setUri(undefined); })} /></>;
}
function AdminDashboard({ run, busy }: { run: (f: () => Promise<void>) => void; busy: boolean }) {
  const [sellers, setSellers] = useState<Profile[]>([]), [reports, setReports] = useState<Report[]>([]), [foods, setFoods] = useState<Listing[]>([]);
  useEffect(() => {
    const fail = (error: Error) => errorMessage(error);
    const stopSellers = watchSellers(setSellers, fail);
    const stopReports = watchReports(setReports, fail);
    const stopFoods = watchAdminListings(setFoods, fail);
    return () => { stopSellers(); stopReports(); stopFoods(); };
  }, []);
  return <>
    <Hero eyebrow="SEEAT ADMIN" title={'Keep good food\non the menu.'} image={art.grocery} />
    <View style={s.sectionRow}><Text style={s.section}>Seller verification</Text><Text style={s.count}>{sellers.length}</Text></View>
    {sellers.map(seller => <View key={seller.id} style={s.adminCard}>
      <View style={s.adminTop}><View style={s.flex}><Text style={s.cardTitle}>{seller.shopName || seller.name}</Text><Text style={s.muted}>{seller.verified ? 'Verified seller' : 'Not verified'}</Text></View><Text style={seller.verified ? s.green : s.count}>{seller.verified ? '✓' : '○'}</Text></View>
      <Button label={seller.verified ? 'Remove verification' : 'Verify seller'} quiet disabled={busy} press={() => run(() => setSellerVerified(seller.id, !seller.verified))} />
    </View>)}
    {!sellers.length && <Empty text="No sellers yet" />}
    <View style={s.sectionRow}><Text style={s.section}>Reports</Text><Text style={s.count}>{reports.filter(report => report.status === 'open').length} open</Text></View>
    {reports.map(report => <View key={report.id} style={s.adminCard}>
      <View style={s.adminTop}><Text style={s.cardTitle}>{report.foodName}</Text><Text style={s.badge}>{report.status}</Text></View>
      <Text style={s.muted}>{report.reason}</Text>
      {report.status === 'open' && <View style={s.adminActions}><Button label="Resolve" disabled={busy} press={() => run(() => setReportStatus(report.id, 'resolved'))} /><Button label="Dismiss" quiet disabled={busy} press={() => run(() => setReportStatus(report.id, 'dismissed'))} /></View>}
    </View>)}
    {!reports.length && <Empty text="No reports yet" />}
    <View style={s.sectionRow}><Text style={s.section}>Listing moderation</Text><Text style={s.count}>{foods.length}</Text></View>
    {foods.map(food => <View key={food.id} style={s.adminCard}>
      <View style={s.adminTop}><FoodArt images={food.images} /><View style={s.flex}><Text style={s.cardTitle}>{food.name}</Text><Text style={s.muted}>{food.sellerName} · {food.active ? 'Visible' : 'Hidden'}</Text></View></View>
      <Button label={food.active ? 'Hide listing' : 'Restore listing'} quiet disabled={busy} press={() => run(() => setListingVisible(food.id, !food.active))} />
    </View>)}
    {!foods.length && <Empty text="No listings yet" />}
  </>;
}
const s = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: '#FFFAF8' }, shell: { flex: 1, maxWidth: 640, width: '100%', alignSelf: 'center' }, header: { paddingHorizontal: 22, paddingVertical: 15, borderBottomWidth: 0, borderColor: '#F0E4E5', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 }, logo: { color: '#3B1831', fontWeight: '900', fontSize: 31, letterSpacing: -2 }, title: { color: '#3B1831', fontSize: 30, fontWeight: '800', marginBottom: 10 }, section: { color: '#3B1831', fontSize: 19, fontWeight: '800', marginTop: 16, marginBottom: 12 }, overline: { color: '#D84F68', fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 8 }, muted: { color: '#806F79', fontSize: 14, lineHeight: 21 }, body: { color: '#6F5A67', marginTop: 12, lineHeight: 21 }, label: { color: '#3B1831', fontWeight: '700', fontSize: 13, marginBottom: 7 }, input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#F0E4E5', borderRadius: 12, padding: 14, fontSize: 15, color: '#3B1831' }, button: { backgroundColor: '#D84F68', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 16 }, buttonText: { color: 'white', fontWeight: '800', fontSize: 15 }, quiet: { backgroundColor: 'white', borderWidth: 1, borderColor: '#F0E4E5' }, link: { color: '#D84F68', fontWeight: '700' }, chips: { gap: 8, paddingVertical: 18 }, chip: { borderWidth: 1, borderColor: '#F0E4E5', backgroundColor: 'white', borderRadius: 30, paddingHorizontal: 14, paddingVertical: 9 }, chipOn: { backgroundColor: '#3B1831', borderColor: '#3B1831' }, chipText: { color: '#765E6C', fontWeight: '700' }, card: { flexDirection: 'row', gap: 14, backgroundColor: 'white', borderRadius: 19, padding: 10, marginBottom: 11, borderWidth: 1, borderColor: '#F0E4E5' }, emoji: { backgroundColor: '#FCECDF', borderRadius: 12, width: 90, height: 95, textAlign: 'center', textAlignVertical: 'center', fontSize: 38, overflow: 'hidden' }, cardTitle: { color: '#3B1831', fontSize: 17, fontWeight: '800', marginBottom: 4 }, price: { color: '#D84F68', fontSize: 18, fontWeight: '800', marginTop: 10 }, green: { color: '#2D8E4C', fontWeight: '700', marginTop: 5 }, empty: { padding: 28, alignItems: 'center', backgroundColor: 'white', borderRadius: 16, marginTop: 18, gap: 10 }, nav: { flexDirection: 'row', padding: 10, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#F0E4E5' }, navItem: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 12 }, navOn: { backgroundColor: '#FDECEF' }, overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,32,24,.5)', justifyContent: 'flex-end' }, sheet: { backgroundColor: '#FFFAF8', maxHeight: '92%', borderTopLeftRadius: 22, borderTopRightRadius: 22 }, foot: { color: '#899087', fontSize: 12, lineHeight: 18, marginTop: 16 }, order: { backgroundColor: 'white', borderRadius: 16, padding: 18, marginTop: 14, borderWidth: 1, borderColor: '#F0E4E5' }, badge: { color: '#9C6334', backgroundColor: '#FFF0D9', alignSelf: 'flex-start', padding: 7, borderRadius: 7, overflow: 'hidden', marginTop: 10, fontWeight: '700' }, qris: { width: 210, height: 210, backgroundColor: 'white', alignSelf: 'center', marginTop: 15 }, editor: { backgroundColor: '#FFF3F2', borderRadius: 20, padding: 17, marginTop: 6, marginBottom: 18 }, row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 13 }, choice: { flex: 1, backgroundColor: 'white', borderColor: '#F0E4E5', borderWidth: 1, padding: 14, borderRadius: 12, alignItems: 'center' }, choiceOn: { borderColor: '#D84F68', backgroundColor: '#FDECEF' }, auth: { backgroundColor: 'white', borderColor: '#F0E4E5', borderWidth: 1, borderRadius: 22, padding: 24 }, center: { flex: 1, maxWidth: 460, width: '100%', alignSelf: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signOut: { color: '#806F79', fontSize: 12, fontWeight: '700' },
  hero: { minHeight: 178, backgroundColor: '#FBE1E7', borderRadius: 24, overflow: 'hidden', marginBottom: 22 },
  heroGreen: { backgroundColor: '#E3F2DC' },
  heroCopy: { padding: 21, width: '64%', zIndex: 1 },
  heroTitle: { color: '#3B1831', fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -.7 },
  heroArt: { position: 'absolute', width: 174, height: 160, right: -7, bottom: 0 },
  search: { marginTop: 0, marginBottom: 2, borderRadius: 16 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 13 },
  count: { color: '#806F79', fontSize: 13, fontWeight: '700' },
  cardCopy: { flex: 1, paddingVertical: 4, paddingRight: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  foodArt: { width: 97, height: 100, borderRadius: 14, backgroundColor: '#F7DDE9' },
  foodArtLarge: { height: 190, borderRadius: 20, overflow: 'hidden', marginBottom: 18, backgroundColor: '#F7DDE9' },
  galleryCount: { position: 'absolute', right: 10, bottom: 10, color: '#FFFFFF', backgroundColor: '#3B1831', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, fontSize: 11, fontWeight: '800' },
  emptyArt: { width: 145, height: 130, borderRadius: 14 },
  editorArt: { width: 130, height: 86, alignSelf: 'flex-end', marginTop: -12, marginBottom: -6 },
  photoStrip: { gap: 10, paddingVertical: 6 },
  photoTile: { width: 112 },
  photoPreview: { width: 112, height: 112, borderRadius: 13, backgroundColor: '#F7DDE9' },
  photoRemove: { paddingVertical: 7, alignItems: 'center' },
  photoRemoveText: { color: '#B7445E', fontSize: 12, fontWeight: '700' },
  detailInfo: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F0E4E5', paddingVertical: 6, marginTop: 17 },
  orderForm: { marginTop: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#F0E4E5', backgroundColor: 'white', borderRadius: 12 },
  stepButton: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#D84F68', fontSize: 21 },
  stepValue: { color: '#3B1831', minWidth: 24, textAlign: 'center', fontWeight: '800' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  authContent: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 35, maxWidth: 500, width: '100%', alignSelf: 'center' },
  setupContent: { flexGrow: 1, maxWidth: 460, width: '100%', alignSelf: 'center', justifyContent: 'center', padding: 28 },
  authHero: { backgroundColor: '#E9F4E6', borderRadius: 24, minHeight: 215, marginTop: 24, marginBottom: 24, overflow: 'hidden' },
  authHeroCopy: { padding: 20, width: '63%', zIndex: 1 },
  authHeroTitle: { color: '#3B1831', fontSize: 24, lineHeight: 28, fontWeight: '900' },
  authArt: { position: 'absolute', width: 170, height: 187, right: -10, bottom: -4 },
  authLink: { textAlign: 'center', marginTop: 20 },
  setupArt: { width: 175, height: 160, alignSelf: 'center', marginBottom: 20 },
  choiceText: { color: '#6E5965', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  choiceTextOn: { color: '#3B1831' },
  caution: { color: '#806F79', fontSize: 12, marginBottom: 18 },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  pickup: { color: '#695A63', fontSize: 12, lineHeight: 19, borderTopWidth: 1, borderColor: '#F0E4E5', paddingTop: 11, marginTop: 13 },
  addLink: { color: '#D84F68', fontSize: 13, fontWeight: '800' },
  editLink: { color: '#D84F68', fontSize: 12, fontWeight: '800', marginTop: 10 },
  twoFields: { flexDirection: 'row', gap: 10 },
  scheduleTitle: { color: '#3B1831', fontSize: 15, fontWeight: '900', marginTop: 24 },
  qrisCard: { backgroundColor: 'white', borderWidth: 1, borderColor: '#F0E4E5', borderRadius: 18, padding: 18, marginTop: 22 },
  reportTrigger: { alignSelf: 'center', padding: 16, marginTop: 12 },
  reportTriggerText: { color: '#806F79', fontSize: 12, fontWeight: '700' },
  reportChoices: { gap: 8, marginBottom: 18 },
  reportChoice: { backgroundColor: 'white', borderWidth: 1, borderColor: '#F0E4E5', padding: 12, borderRadius: 12 },
  adminCard: { backgroundColor: 'white', borderWidth: 1, borderColor: '#F0E4E5', borderRadius: 17, padding: 15, marginBottom: 10 },
  adminTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  adminActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-start' },
});
