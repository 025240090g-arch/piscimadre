import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, reload, updateProfile } from 'firebase/auth';
import { getFirestore, collection, query, where, doc, addDoc, updateDoc, deleteDoc, onSnapshot, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  MapPin, Map as MapIcon, List, Clock, DollarSign, Utensils, 
  MessageCircle, Plus, Edit2, Trash2, CheckCircle, XCircle, 
  Settings, LogOut, Info, AlertTriangle, Menu, X,
  Download, Smartphone, Share, Mail as MailIcon, Star, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Navigation
} from 'lucide-react';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "mock", authDomain: "mock", projectId: "mock", storageBucket: "mock", messagingSenderId: "mock", appId: "mock"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase();
const OWNER_PROFILES_COLLECTION = 'ownerProfiles';
const isAdminUser = (user) => Boolean(ADMIN_EMAIL && user?.emailVerified && user?.email?.toLowerCase() === ADMIN_EMAIL);

const PUERTO_MALDONADO_COORDS = [-12.5933, -69.1836];

const loadLeaflet = () => {
  return new Promise((resolve) => {
    if (window.L) {
      resolve(window.L);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve(window.L);
    document.head.appendChild(script);
  });
};

const injectStyles = () => {
  if (!document.getElementById('pool-app-styles')) {
    const style = document.createElement('style');
    style.id = 'pool-app-styles';
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
      
      .pool-app-container { font-family: 'Outfit', sans-serif; }
      .leaflet-popup-content-wrapper { background: #1E293B; color: #F8FAFC; border-radius: 12px; }
      .leaflet-popup-tip { background: #1E293B; }
      .leaflet-container { font-family: 'Outfit', sans-serif; z-index: 10; }
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-track { background: #0F172A; }
      ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #475569; }
    `;
    document.head.appendChild(style);
  }
  
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
};

export default function PoolDirectoryApp() {
  const [user, setUser] = useState(null);
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [ownerAccessLoading, setOwnerAccessLoading] = useState(false);
  const [authRefresh, setAuthRefresh] = useState(0);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('public');
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [filters, setFilters] = useState({ openNow: false, free: false, food: false });

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    let signingInAnonymously = false;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      // The public directory uses an anonymous session. Recreate it after an owner signs out.
      if (!currentUser && !signingInAnonymously) {
        signingInAnonymously = true;
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        } catch (err) {
          console.error('Auth initialization error:', err);
          setLoading(false);
          showNotification('No se pudo iniciar la sesión pública. Recarga la página.', 'error');
        } finally {
          signingInAnonymously = false;
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Verified email accounts receive a pending owner profile automatically.
  // The administrator account is identified by VITE_ADMIN_EMAIL and does not need an owner profile.
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setOwnerProfile(null);
      setOwnerAccessLoading(false);
      return;
    }
    if (!user.emailVerified) {
      setOwnerProfile({ status: 'unverified' });
      setOwnerAccessLoading(false);
      return;
    }
    if (isAdminUser(user)) {
      setOwnerProfile({ status: 'approved', role: 'admin' });
      setOwnerAccessLoading(false);
      return;
    }

    setOwnerAccessLoading(true);
    const profileRef = doc(db, OWNER_PROFILES_COLLECTION, user.uid);
    let creatingProfile = false;
    const unsubscribe = onSnapshot(profileRef, async (snapshot) => {
      if (snapshot.exists()) {
        setOwnerProfile({ id: snapshot.id, ...snapshot.data() });
        setOwnerAccessLoading(false);
        return;
      }
      if (creatingProfile) return;
      creatingProfile = true;
      try {
        await setDoc(profileRef, {
          email: user.email || '',
          name: user.displayName || '',
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error('Owner profile creation error:', error);
        setOwnerProfile({ status: 'error', message: error.message || 'No se pudo crear la solicitud.' });
        setOwnerAccessLoading(false);
      }
    }, (error) => {
      console.error('Owner profile listener error:', error);
      setOwnerProfile({ status: 'error', message: error.message || 'No se pudo consultar tu solicitud.' });
      setOwnerAccessLoading(false);
    });
    return () => unsubscribe();
  }, [user, authRefresh]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const poolsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pools');
    
    const unsubscribe = onSnapshot(poolsRef, (snapshot) => {
      const poolsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPools(poolsData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      showNotification("Error al cargar datos", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const showNotification = (message, type = 'info') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'info' }), 4000);
  };

  const isPoolOpenNow = (openTime, closeTime) => {
    if (!openTime || !closeTime) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    const openMins = openH * 60 + openM;
    const closeMins = closeH * 60 + closeM;
    
    if (closeMins < openMins) {
      return currentMinutes >= openMins || currentMinutes <= closeMins;
    }
    return currentMinutes >= openMins && currentMinutes <= closeMins;
  };

  const filteredPools = useMemo(() => {
    return pools.filter(pool => {
      if (filters.openNow && !isPoolOpenNow(pool.openTime, pool.closeTime)) return false;
      if (filters.free && pool.price > 0) return false;
      if (filters.food && !pool.hasFood) return false;
      return true;
    });
  }, [pools, filters]);

  return (
    <div className="pool-app-container min-h-screen bg-[#0F172A] text-slate-200 flex flex-col font-sans">
      <nav className="bg-[#1E293B] border-b border-[#334155] px-4 py-3 sticky top-0 z-50 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-2">
          <div className="bg-cyan-500 p-2 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <DropletIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">Pisci<span className="text-cyan-400">Madre</span></h1>
            <p className="text-[10px] text-cyan-200 uppercase tracking-wider font-semibold">Directorio Puerto Maldonado</p>
          </div>
        </div>

        <div className="hidden md:flex gap-4 items-center">
          <button 
            onClick={() => setShowInstallModal(true)}
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-medium mr-4 px-3 py-1.5 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors"
          >
            <Download className="w-4 h-4" /> Instalar App
          </button>
          <button 
            onClick={() => setViewMode('public')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'public' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Directorio Público
          </button>
          <button 
            onClick={() => setViewMode('owner')}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${viewMode === 'owner' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Settings className="w-4 h-4" /> Panel Dueños
          </button>
        </div>

        <button className="md:hidden p-2 text-slate-300" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="md:hidden bg-[#1E293B] border-b border-[#334155] p-4 flex flex-col gap-3 absolute w-full z-40 shadow-xl">
          <button 
            onClick={() => { setShowInstallModal(true); setMobileMenuOpen(false); }}
            className="px-4 py-3 rounded-lg font-bold w-full text-left flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-lg mb-2"
          >
            <Smartphone className="w-5 h-5" /> Instalar en el Celular
          </button>
          <button 
            onClick={() => { setViewMode('public'); setMobileMenuOpen(false); }}
            className={`px-4 py-3 rounded-lg font-medium w-full text-left ${viewMode === 'public' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-300'}`}
          >
            Directorio Público
          </button>
          <button 
            onClick={() => { setViewMode('owner'); setMobileMenuOpen(false); }}
            className={`px-4 py-3 rounded-lg font-medium w-full text-left flex items-center gap-2 ${viewMode === 'owner' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-300'}`}
          >
            <Settings className="w-4 h-4" /> Panel para Dueños
          </button>
        </div>
      )}

      {notification.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full font-semibold shadow-2xl flex items-center gap-2 animate-bounce
          ${notification.type === 'error' ? 'bg-rose-500 text-white' : 'bg-cyan-500 text-white'}
        `}>
          {notification.type === 'error' ? <AlertTriangle className="w-5 h-5"/> : <Info className="w-5 h-5"/>}
          {notification.message}
        </div>
      )}

      <main className="flex-1 flex flex-col relative">
        {viewMode === 'public' ? (
          loading && pools.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400"></div>
            </div>
          ) : (
            <PublicView pools={filteredPools} filters={filters} setFilters={setFilters} />
          )
        ) : (
          !user || user.isAnonymous ? (
            <OwnerAuth showNotification={showNotification} onBack={() => setViewMode('public')} />
          ) : !user.emailVerified ? (
            <VerifyOwnerEmail user={user} showNotification={showNotification} onRefresh={(refreshedUser) => { if (refreshedUser) setUser(refreshedUser); setAuthRefresh(v => v + 1); }} onBack={() => setViewMode('public')} />
          ) : ownerAccessLoading ? (
            <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400"></div></div>
          ) : isAdminUser(user) ? (
            <AdminDashboard user={user} pools={pools} showNotification={showNotification} onLogout={() => signOut(auth)} />
          ) : ownerProfile?.status === 'approved' ? (
            <OwnerDashboard user={user} pools={pools} showNotification={showNotification} onLogout={() => signOut(auth)} />
          ) : ownerProfile?.status === 'pending' ? (
            <OwnerPending user={user} onLogout={() => signOut(auth)} />
          ) : ownerProfile?.status === 'rejected' ? (
            <OwnerRejected user={user} onLogout={() => signOut(auth)} />
          ) : ownerProfile?.status === 'error' ? (
            <OwnerProfileError message={ownerProfile.message} onLogout={() => signOut(auth)} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-300">No se pudo determinar el estado de tu cuenta. Cierra sesión e inténtalo de nuevo.</div>
          )
        )}
      </main>

      {showInstallModal && <InstallModal onClose={() => setShowInstallModal(false)} />}
    </div>
  );
}

function PublicView({ pools, filters, setFilters }) {
  const [activeTab, setActiveTab] = useState('map');

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-70px)]">
      <div className="lg:hidden flex bg-[#1E293B] border-b border-slate-700">
        <button 
          onClick={() => setActiveTab('map')}
          className={`flex-1 py-3 font-semibold flex items-center justify-center gap-2 ${activeTab === 'map' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'}`}
        >
          <MapIcon className="w-5 h-5" /> Mapa
        </button>
        <button 
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-3 font-semibold flex items-center justify-center gap-2 ${activeTab === 'list' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'}`}
        >
          <List className="w-5 h-5" /> Lista ({pools.length})
        </button>
      </div>

      <div className={`flex-1 relative ${activeTab === 'map' ? 'block' : 'hidden lg:block'}`}>
        <MapComponent pools={pools} />
        
        <div className="absolute bottom-6 right-4 z-[400] bg-[#1E293B]/90 backdrop-blur p-3 rounded-xl shadow-lg border border-slate-700 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white"></div>
            <span>Disponible</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-white"></div>
            <span>Lleno / Sin espacio</span>
          </div>
        </div>
      </div>

      <div className={`w-full lg:w-[450px] xl:w-[500px] bg-[#0F172A] border-l border-slate-800 flex flex-col h-full overflow-hidden ${activeTab === 'list' ? 'block' : 'hidden lg:flex'}`}>
        <div className="p-4 bg-[#1E293B] border-b border-slate-700 shrink-0">
          <h2 className="text-lg font-bold mb-3 text-white">Filtros</h2>
          <div className="flex flex-wrap gap-2">
            <FilterChip 
              active={filters.openNow} 
              onClick={() => setFilters(f => ({...f, openNow: !f.openNow}))}
              icon={<Clock className="w-4 h-4" />} label="Abierto Ahora" 
            />
            <FilterChip 
              active={filters.free} 
              onClick={() => setFilters(f => ({...f, free: !f.free}))}
              icon={<DollarSign className="w-4 h-4" />} label="Gratis" 
            />
            <FilterChip 
              active={filters.food} 
              onClick={() => setFilters(f => ({...f, food: !f.food}))}
              icon={<Utensils className="w-4 h-4" />} label="Con Comida" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {pools.length === 0 ? (
            <div className="text-center p-8 text-slate-400">
              <DropletIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No se encontraron piscinas con estos filtros.</p>
            </div>
          ) : (
            pools.map(pool => <PoolCard key={pool.id} pool={pool} />)
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border
        ${active ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}
      `}
    >
      {icon} {label}
    </button>
  );
}

function PoolCard({ pool }) {
  const [activeImage, setActiveImage] = useState(0);
  const photos = Array.isArray(pool.images)
    ? pool.images.map(photo => typeof photo === 'string' ? { url: photo } : photo).filter(photo => photo && photo.url)
    : [];
  const foodItems = Array.isArray(pool.foodItems) ? pool.foodItems.filter(item => item && item.name) : [];
  const categories = Array.from(new Set(foodItems.map(item => item.category || 'Otros')));
  const mapsUrl = pool.lat != null && pool.lng != null
    ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(pool.lat + ',' + pool.lng) + '&travelmode=driving'
    : '';

  const formatWhatsapp = (num) => {
    let clean = String(num || '').replace(/\D/g, '');
    if (clean.length === 9) clean = '51' + clean;
    return 'https://wa.me/' + clean;
  };

  return (
    <article className="bg-[#1E293B] border border-slate-700 rounded-2xl overflow-hidden shadow-lg hover:border-cyan-500/50 transition-colors">
      {photos.length > 0 && (
        <div className="relative h-48 bg-slate-800">
          <img src={photos[Math.min(activeImage, photos.length - 1)].url} alt={'Fotografía de ' + pool.name} className="w-full h-full object-cover" loading="lazy" />
          {photos.length > 1 && (
            <>
              <button type="button" aria-label="Fotografía anterior" onClick={() => setActiveImage(index => (index - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 p-2 text-white hover:bg-slate-950"><ChevronLeft className="w-5 h-5" /></button>
              <button type="button" aria-label="Fotografía siguiente" onClick={() => setActiveImage(index => (index + 1) % photos.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/70 p-2 text-white hover:bg-slate-950"><ChevronRight className="w-5 h-5" /></button>
              <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs text-white">{activeImage + 1} / {photos.length}</span>
            </>
          )}
        </div>
      )}

      <div className="p-5">
        <div className="flex justify-between items-start gap-3 mb-3">
          <h3 className="text-xl font-bold text-white leading-tight">{pool.name}</h3>
          <div className={'shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1 ' + (pool.isFull ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30')}>
            <span className={'w-2 h-2 rounded-full ' + (pool.isFull ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse')}></span>
            {pool.isFull ? 'Lleno' : 'Disponible'}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 px-3 py-1 text-xs font-semibold">
            {pool.venueType === 'quebrada' ? 'Quebrada' : 'Piscina'}
          </span>
          {pool.hasKidsPool && (
            <span className="rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 px-3 py-1 text-xs font-semibold">
              Piscina para niños
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{pool.openTime} - {pool.closeTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{Number(pool.price) === 0 ? 'Gratis' : 'S/ ' + pool.price}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
              <Navigation className="w-5 h-5" /> Cómo llegar
            </a>
          )}
          {pool.whatsapp && (
            <a href={formatWhatsapp(pool.whatsapp)} target="_blank" rel="noopener noreferrer" className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
              <MessageCircle className="w-5 h-5" /> WhatsApp
            </a>
          )}
        </div>

        {pool.hasFood && (
          <details className="mb-4 bg-slate-800/60 rounded-xl border border-slate-700 overflow-hidden">
            <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-3 text-teal-300 font-semibold">
              <span className="flex items-center gap-2"><Utensils className="w-4 h-4" /> Menú y comidas</span>
              <ChevronDown className="w-4 h-4" />
            </summary>
            <div className="px-3 pb-3 space-y-4">
              {foodItems.length > 0 ? categories.map(category => (
                <section key={category}>
                  <h4 className="text-sm font-bold uppercase tracking-wide text-cyan-300 mb-2">{category}</h4>
                  <div className="space-y-3">
                    {foodItems.filter(item => (item.category || 'Otros') === category).map((item, index) => (
                      <div key={item.id || category + index} className="flex gap-3 border-b border-slate-700/70 pb-3 last:border-0">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-lg object-cover shrink-0" loading="lazy" /> : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between items-start gap-2">
                            <p className="font-semibold text-white">{item.name}</p>
                            {item.price !== '' && item.price != null && <span className="text-emerald-300 text-sm font-bold shrink-0">S/ {Number(item.price).toFixed(2)}</span>}
                          </div>
                          {item.description && <p className="text-xs text-slate-400 mt-1">{item.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )) : (
                <p className="text-sm text-slate-400">{pool.foodMenu || 'El establecimiento todavía no ha agregado platos a su menú.'}</p>
              )}
              {foodItems.length > 0 && pool.foodMenu && <p className="text-xs text-slate-500 border-t border-slate-700 pt-2">{pool.foodMenu}</p>}
            </div>
          </details>
        )}

        <PoolReviews poolId={pool.id} />
      </div>
    </article>
  );
}

function PoolReviews({ poolId }) {
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const reviewsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pools', poolId, 'reviews');
    const approvedReviews = query(reviewsRef, where('status', '==', 'approved'));
    const unsubscribe = onSnapshot(approvedReviews, snapshot => {
      const nextReviews = snapshot.docs.map(reviewDoc => ({ id: reviewDoc.id, ...reviewDoc.data() }));
      nextReviews.sort((a, b) => {
        const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });
      setReviews(nextReviews.slice(0, 10));
      setLoadingReviews(false);
    }, error => {
      console.error('Pool reviews listener error:', error);
      setLoadingReviews(false);
    });
    return () => unsubscribe();
  }, [poolId]);

  const average = reviews.length ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length : 0;

  const submitReview = async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      setNotice('No se detectó una sesión. Recarga la página e inténtalo nuevamente.');
      return;
    }
    if (!displayName.trim() || comment.trim().length < 3) {
      setNotice('Escribe tu nombre y un comentario de al menos 3 caracteres.');
      return;
    }
    setSending(true);
    setNotice('');
    try {
      const reviewsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pools', poolId, 'reviews');
      await addDoc(reviewsRef, {
        displayName: displayName.trim().slice(0, 60),
        rating,
        comment: comment.trim().slice(0, 500),
        status: 'approved',
        createdAt: serverTimestamp()
      });
      setComment('');
      setRating(5);
      setNotice('¡Gracias! Tu opinión ya se publicó.');
    } catch (error) {
      console.error('Review submit error:', error);
      setNotice('No se pudo enviar la opinión. Revisa la configuración de reglas de Firebase.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="border-t border-slate-700 pt-3">
      <button type="button" onClick={() => setExpanded(value => !value)} className="w-full flex items-center justify-between text-left">
        <span className="font-semibold text-white flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          Opiniones {reviews.length > 0 ? '(' + reviews.length + ')' : ''}
          {reviews.length > 0 && <span className="text-amber-300 text-sm">{average.toFixed(1)} / 5</span>}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="mt-3 space-y-4">
          {loadingReviews ? <p className="text-xs text-slate-400">Cargando opiniones…</p> : reviews.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay opiniones publicadas. ¡Sé la primera persona en opinar!</p> : (
            <div className="space-y-3">
              {reviews.map(review => (
                <article key={review.id} className="bg-slate-800/60 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-white text-sm">{review.displayName}</p>
                    <span className="text-amber-300 text-xs">{'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, Number(review.rating) || 0)))}</span>
                  </div>
                  <p className="text-sm text-slate-300 mt-2">{review.comment}</p>
                </article>
              ))}
            </div>
          )}
          <form onSubmit={submitReview} className="bg-slate-800/50 rounded-xl p-3 space-y-3">
            <p className="text-sm font-semibold text-white">Comparte tu experiencia</p>
            <input value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={60} placeholder="Tu nombre" className="w-full bg-[#0F172A] border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            <div className="flex items-center gap-1" aria-label="Calificación">
              {[1, 2, 3, 4, 5].map(value => (
                <button key={value} type="button" aria-label={'Calificar con ' + value + ' estrellas'} onClick={() => setRating(value)} className="p-1">
                  <Star className={'w-5 h-5 ' + (value <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-500')} />
                </button>
              ))}
            </div>
            <textarea value={comment} onChange={event => setComment(event.target.value)} required minLength={3} maxLength={500} rows={3} placeholder="¿Qué tal fue tu visita?" className="w-full bg-[#0F172A] border border-slate-600 rounded-lg px-3 py-2 text-sm text-white resize-y" />
            <button disabled={sending} className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-slate-950 font-bold py-2.5 text-sm">{sending ? 'Enviando…' : 'Enviar opinión'}</button>
            {notice && <p className="text-xs text-slate-400" role="status">{notice}</p>}
            <p className="text-[11px] text-slate-500">Tu opinión aparece públicamente al enviarla. No necesitas verificar tu correo.</p>
          </form>
        </div>
      )}
    </section>
  );
}

function MapComponent({ pools, onMapClick, editingPosition }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const [L, setL] = useState(null);

  useEffect(() => {
    loadLeaflet().then(leaflet => {
      setL(leaflet);
    });
  }, []);

  useEffect(() => {
    if (!L || !mapRef.current) return;

    if (!leafletMapRef.current) {
      if (mapRef.current._leaflet_id) {
        mapRef.current._leaflet_id = null;
        mapRef.current.innerHTML = '';
      }

      const map = L.map(mapRef.current, { zoomControl: false }).setView(PUERTO_MALDONADO_COORDS, 13);
      
      L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
      }).addTo(map);
      
      layerGroupRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;

      if (onMapClick) {
        map.on('click', (e) => {
          onMapClick([e.latlng.lat, e.latlng.lng]);
        });
      }

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }

    const map = leafletMapRef.current;
    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    const createStatusIcon = (isFull) => {
      return L.divIcon({
        className: 'custom-pool-marker',
        html: `
          <div style="
            background-color: ${isFull ? '#E11D48' : '#10B981'};
            width: 28px; height: 28px; 
            border-radius: 50%; 
            border: 3px solid #ffffff; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            display: flex; justify-content: center; align-items: center;
          ">
            <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });
    };

    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    });

    if (editingPosition) {
      L.marker(editingPosition, { icon: defaultIcon }).addTo(layerGroup);
    }

    pools.forEach(pool => {
      const marker = L.marker([pool.lat, pool.lng], { icon: createStatusIcon(pool.isFull) }).addTo(layerGroup);
      
      const popupContent = `
        <div class="p-1 font-sans text-slate-800">
          <h4 class="font-bold text-lg mb-1">${pool.name}</h4>
          <p class="font-semibold mb-2 ${pool.isFull ? 'text-rose-600' : 'text-emerald-600'}">
            ${pool.isFull ? '🔴 Lleno' : '🟢 Disponible'}
          </p>
          <p class="text-sm">🕒 ${pool.openTime} - ${pool.closeTime}</p>
          <p class="text-sm">💰 ${Number(pool.price) === 0 ? 'Gratis' : 'S/ ' + pool.price}</p>
        </div>
      `;
      marker.bindPopup(popupContent);
    });

  }, [L, pools, editingPosition, onMapClick]);

  return <div ref={mapRef} className="absolute inset-0 w-full h-full z-10 bg-[#0F172A]"></div>;
}

function OwnerAuth({ showNotification, onBack }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
        await sendEmailVerification(credential.user);
        showNotification('Cuenta creada. Revisa tu correo para verificarla.', 'success');
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          showNotification('Tu correo aún no está verificado. Te reenviamos el enlace.', 'error');
        } else {
          showNotification('Sesión iniciada correctamente.', 'success');
        }
      }
    } catch (error) {
      console.error('Owner authentication error:', error);
      const messages = {
        'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Inicia sesión.',
        'auth/invalid-email': 'El correo no tiene un formato válido.',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/user-not-found': 'No existe una cuenta con ese correo.',
        'auth/wrong-password': 'Correo o contraseña incorrectos.',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo otra vez.',
        'auth/operation-not-allowed': 'Activa Email/Password en Firebase Authentication.',
      };
      showNotification(messages[error.code] || error.message || 'No se pudo completar el acceso.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      showNotification('Escribe tu correo para enviarte el enlace de recuperación.', 'error');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      showNotification('Te enviamos un enlace para restablecer tu contraseña.', 'success');
    } catch (error) {
      console.error(error);
      showNotification(error.message || 'No se pudo enviar el correo.', 'error');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md bg-[#1E293B] border border-slate-700 rounded-2xl p-7 shadow-2xl">
        <button onClick={onBack} className="text-slate-400 hover:text-white mb-5">← Volver al directorio</button>
        <div className="flex items-center gap-3 mb-2"><Settings className="w-7 h-7 text-emerald-400"/><h2 className="text-2xl font-bold text-white">Acceso para propietarios</h2></div>
        <p className="text-slate-400 text-sm mb-6">Registra tu cuenta o inicia sesión para administrar una piscina. Las nuevas cuentas deben ser aprobadas por Piscimadre.</p>
        <div className="flex bg-[#0F172A] rounded-xl p-1 mb-5">
          <button type="button" onClick={() => setMode('login')} className={`flex-1 py-2 rounded-lg font-semibold ${mode === 'login' ? 'bg-cyan-500 text-slate-900' : 'text-slate-400'}`}>Iniciar sesión</button>
          <button type="button" onClick={() => setMode('register')} className={`flex-1 py-2 rounded-lg font-semibold ${mode === 'register' ? 'bg-cyan-500 text-slate-900' : 'text-slate-400'}`}>Solicitar acceso</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && <div><label className="block text-sm font-semibold text-slate-300 mb-1">Nombre del propietario</label><input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#0F172A] border border-slate-600 rounded-lg px-4 py-3 text-white" placeholder="Tu nombre" /></div>}
          <div><label className="block text-sm font-semibold text-slate-300 mb-1">Correo electrónico</label><input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#0F172A] border border-slate-600 rounded-lg px-4 py-3 text-white" placeholder="nombre@correo.com" autoComplete="email" /></div>
          <div><label className="block text-sm font-semibold text-slate-300 mb-1">Contraseña</label><input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#0F172A] border border-slate-600 rounded-lg px-4 py-3 text-white" placeholder="Mínimo 6 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>
          <button disabled={submitting} className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-slate-900 font-bold py-3 rounded-xl">{submitting ? 'Procesando…' : mode === 'login' ? 'Entrar al panel' : 'Crear cuenta y solicitar aprobación'}</button>
        </form>
        {mode === 'login' && <button onClick={handlePasswordReset} className="text-sm text-cyan-400 hover:underline mt-4">¿Olvidaste tu contraseña?</button>}
        <p className="text-xs text-slate-500 mt-5">El directorio público no requiere cuenta. El registro solo habilita una solicitud; no permite publicar hasta recibir aprobación.</p>
      </div>
    </div>
  );
}

function VerifyOwnerEmail({ user, showNotification, onRefresh, onBack }) {
  const [checking, setChecking] = useState(false);
  const refreshVerification = async () => {
    setChecking(true);
    try {
      await reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
      onRefresh(auth.currentUser);
      if (auth.currentUser?.emailVerified) showNotification('Correo verificado. Estamos revisando tu solicitud.', 'success');
      else showNotification('Todavía no figura como verificado. Abre el enlace que enviamos a tu correo.', 'error');
    } catch (error) {
      showNotification(error.message || 'No se pudo comprobar la verificación.', 'error');
    } finally { setChecking(false); }
  };
  const resend = async () => {
    try { await sendEmailVerification(auth.currentUser); showNotification('Te reenviamos el correo de verificación.', 'success'); }
    catch (error) { showNotification(error.message || 'No se pudo reenviar el correo.', 'error'); }
  };
  return <div className="flex-1 flex items-center justify-center p-4"><div className="max-w-lg w-full bg-[#1E293B] border border-slate-700 rounded-2xl p-8 text-center">
    <MailIcon className="w-12 h-12 text-cyan-400 mx-auto mb-4"/><h2 className="text-2xl font-bold text-white mb-2">Verifica tu correo</h2>
    <p className="text-slate-300 mb-2">Enviamos un enlace a <strong>{user.email}</strong>.</p><p className="text-slate-400 text-sm mb-6">Abre el correo, confirma tu dirección y vuelve aquí. Después tu solicitud quedará pendiente de aprobación.</p>
    <button onClick={refreshVerification} disabled={checking} className="w-full bg-cyan-500 text-slate-900 font-bold py-3 rounded-xl disabled:opacity-60">{checking ? 'Comprobando…' : 'Ya verifiqué mi correo'}</button>
    <button onClick={resend} className="text-cyan-400 text-sm mt-4 hover:underline">Reenviar correo de verificación</button>
    <div><button onClick={onBack} className="text-slate-400 text-sm mt-5 hover:text-white">Volver al directorio</button></div>
  </div></div>;
}

function OwnerPending({ user, onLogout }) {
  return <div className="flex-1 flex items-center justify-center p-4"><div className="max-w-lg w-full bg-[#1E293B] border border-amber-500/30 rounded-2xl p-8 text-center">
    <Clock className="w-12 h-12 text-amber-400 mx-auto mb-4"/><h2 className="text-2xl font-bold text-white mb-2">Solicitud pendiente</h2>
    <p className="text-slate-300 mb-2">Tu cuenta <strong>{user.email}</strong> ya está verificada.</p><p className="text-slate-400 text-sm mb-6">El equipo de Piscimadre debe aprobar tu acceso antes de que puedas publicar o administrar piscinas.</p>
    <button onClick={onLogout} className="px-5 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800">Cerrar sesión</button>
  </div></div>;
}

function OwnerRejected({ user, onLogout }) {
  return <div className="flex-1 flex items-center justify-center p-4"><div className="max-w-lg w-full bg-[#1E293B] border border-rose-500/30 rounded-2xl p-8 text-center">
    <XCircle className="w-12 h-12 text-rose-400 mx-auto mb-4"/><h2 className="text-2xl font-bold text-white mb-2">Solicitud no aprobada</h2><p className="text-slate-400 mb-6">Tu solicitud para {user.email} no fue aprobada. Contacta al equipo de Piscimadre si necesitas más información.</p>
    <button onClick={onLogout} className="px-5 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800">Cerrar sesión</button>
  </div></div>;
}

function OwnerProfileError({ message, onLogout }) {
  return <div className="flex-1 flex items-center justify-center p-4"><div className="max-w-lg w-full bg-[#1E293B] border border-rose-500/30 rounded-2xl p-8 text-center">
    <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4"/><h2 className="text-2xl font-bold text-white mb-2">No se pudo consultar tu solicitud</h2><p className="text-slate-400 text-sm mb-6">{message}</p><button onClick={onLogout} className="px-5 py-3 rounded-xl border border-slate-600 text-slate-300">Cerrar sesión</button>
  </div></div>;
}

function AdminDashboard({ user, pools, showNotification, onLogout }) {
  const [owners, setOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, OWNER_PROFILES_COLLECTION), snapshot => {
      setOwners(snapshot.docs.map(ownerDoc => ({ id: ownerDoc.id, ...ownerDoc.data() })));
      setLoadingOwners(false);
    }, error => {
      console.error('Admin owner list error:', error);
      showNotification('No se pudieron cargar las solicitudes de propietarios.', 'error');
      setLoadingOwners(false);
    });
    return () => unsubscribe();
  }, []);

  // Las opiniones son públicas y se publican al enviarse; no existe cola de moderación.
  useEffect(() => {
    setPendingReviews([]);
    setLoadingReviews(false);
  }, []);

  const decideOwner = async (owner, status) => {
    try {
      await updateDoc(doc(db, OWNER_PROFILES_COLLECTION, owner.id), {
        status,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.email,
      });
      showNotification(status === 'approved' ? 'Acceso aprobado para ' + owner.email : 'Solicitud rechazada para ' + owner.email, 'success');
    } catch (error) {
      console.error('Owner approval error:', error);
      showNotification(error.message || 'No se pudo actualizar la solicitud.', 'error');
    }
  };

  const decideReview = async (review, status) => {
    try {
      await updateDoc(review.ref, {
        status,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.email
      });
      showNotification(status === 'approved' ? 'Opinión publicada.' : 'Opinión rechazada.', 'success');
    } catch (error) {
      console.error('Review moderation error:', error);
      showNotification('No se pudo moderar la opinión. Revisa las reglas de Firestore.', 'error');
    }
  };

  const pendingOwners = owners.filter(owner => owner.status === 'pending');

  return (
    <div className="w-full">
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Administración de Piscimadre</h2>
            <p className="text-slate-400">Aprueba propietarios, revisa opiniones y supervisa el directorio.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 text-sm">Administrador</span>
            <button onClick={onLogout} className="px-4 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800">Cerrar sesión</button>
          </div>
        </div>

        <div className="bg-[#1E293B] border border-slate-700 rounded-2xl p-6 mb-8">
          <div className="flex justify-between items-center gap-3 mb-5">
            <div>
              <h3 className="text-xl font-bold text-white">Solicitudes de propietarios</h3>
              <p className="text-sm text-slate-400">Solo las cuentas aprobadas pueden publicar piscinas.</p>
            </div>
            <span className="bg-amber-500/15 text-amber-300 rounded-full px-3 py-1 text-sm">{pendingOwners.length} pendientes</span>
          </div>
          {loadingOwners ? <p className="text-slate-400">Cargando solicitudes…</p> : pendingOwners.length === 0 ? <p className="text-slate-400">No hay solicitudes pendientes.</p> : (
            <div className="space-y-3">
              {pendingOwners.map(owner => (
                <div key={owner.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-[#0F172A] rounded-xl border border-slate-700">
                  <div>
                    <p className="font-semibold text-white">{owner.name || 'Propietario'}</p>
                    <p className="text-sm text-slate-400">{owner.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => decideOwner(owner, 'rejected')} className="px-4 py-2 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10">Rechazar</button>
                    <button onClick={() => decideOwner(owner, 'approved')} className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400">Aprobar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#1E293B] border border-slate-700 rounded-2xl p-6 mb-8">
          <h3 className="text-xl font-bold text-white">Opiniones públicas</h3>
          <p className="text-sm text-slate-400 mt-2">Las opiniones de los visitantes se publican automáticamente. No requieren revisión ni aprobación.</p>
        </div>

        <OwnerDashboard user={user} pools={pools} showNotification={showNotification} onLogout={null} isAdmin={true} />
      </div>
    </div>
  );
}

function OwnerDashboard({ user, pools, showNotification, onLogout, isAdmin = false }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingPool, setEditingPool] = useState(null);
  
  const myPools = isAdmin ? pools : pools.filter(p => p.ownerId === user.uid);

  const handleAddNew = () => {
    setEditingPool(null);
    setIsEditing(true);
  };

  const togglePoolStatus = async (pool) => {
    try {
      const poolRef = doc(db, 'artifacts', appId, 'public', 'data', 'pools', pool.id);
      await updateDoc(poolRef, { isFull: !pool.isFull });
      showNotification(`Estado actualizado: ${!pool.isFull ? 'Lleno' : 'Disponible'}`, 'success');
    } catch (err) {
      console.error(err);
      showNotification("Error al actualizar estado", "error");
    }
  };

  const deletePool = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pools', id));
      showNotification("Piscina eliminada", "success");
    } catch(err) {
      console.error(err);
      showNotification("Error al eliminar", "error");
    }
  }

  if (isEditing) {
    return <PoolForm 
             user={user} 
             pool={editingPool} 
             onClose={() => setIsEditing(false)} 
             showNotification={showNotification} 
           />;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full flex-1 overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">{isAdmin ? 'Administración de Piscimadre' : 'Panel de Dueños'}</h2>
          <p className="text-slate-400">{isAdmin ? 'Gestiona todas las piscinas del directorio.' : 'Gestiona tus piscinas, horarios y disponibilidad en tiempo real.'}</p>
        </div>
        <div className="flex items-center gap-3">
        {onLogout && <button onClick={onLogout} className="px-4 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800">Cerrar sesión</button>}
        <button 
          onClick={handleAddNew}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-3 px-6 rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all"
        >
          <Plus className="w-5 h-5" /> Agregar Piscina
        </button>
        </div>
      </div>

      {myPools.length === 0 ? (
        <div className="bg-[#1E293B] border border-dashed border-slate-600 rounded-2xl p-12 text-center">
          <MapPin className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Aún no tienes piscinas</h3>
          <p className="text-slate-400 mb-6">Agrega tu primera piscina para que aparezca en el mapa público.</p>
          <button onClick={handleAddNew} className="text-cyan-400 font-semibold hover:underline">Comenzar ahora</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {myPools.map(pool => (
            <div key={pool.id} className="bg-[#1E293B] border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-5 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-white">{pool.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingPool(pool); setIsEditing(true); }} className="p-2 text-slate-400 hover:text-cyan-400 bg-slate-800 rounded-lg">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deletePool(pool.id)} className="p-2 text-slate-400 hover:text-rose-400 bg-slate-800 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="mt-6 mb-4">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2 text-center">Estado Actual del Local</p>
                  <button 
                    onClick={() => togglePoolStatus(pool)}
                    className={`w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-lg
                      ${pool.isFull 
                        ? 'bg-rose-500 text-white border-2 border-rose-400 shadow-rose-500/20' 
                        : 'bg-emerald-500 text-white border-2 border-emerald-400 shadow-emerald-500/20'}
                    `}
                  >
                    {pool.isFull ? <XCircle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                    {pool.isFull ? 'MARCAR COMO DISPONIBLE' : 'MARCAR COMO LLENO'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PoolForm({ user, pool, onClose, showNotification }) {
  const inputClass = "w-full bg-[#0F172A] border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-cyan-500";
  const categories = ['Platos regionales', 'Pescados', 'Parrillas', 'Postres', 'Bebidas', 'Otros'];
  const [formData, setFormData] = useState({
    name: pool?.name || '',
    venueType: pool?.venueType || 'pool',
    hasKidsPool: pool?.hasKidsPool || false,
    openTime: pool?.openTime || '09:00',
    closeTime: pool?.closeTime || '18:00',
    price: pool?.price != null ? String(pool.price) : '10',
    hasFood: pool?.hasFood || false,
    foodMenu: pool?.foodMenu || '',
    images: Array.isArray(pool?.images) ? pool.images.map(photo => typeof photo === 'string' ? { url: photo } : photo).filter(photo => photo && photo.url) : [],
    whatsapp: pool?.whatsapp || '',
    lat: pool?.lat ?? null,
    lng: pool?.lng ?? null,
  });
  const [foodItems, setFoodItems] = useState(Array.isArray(pool?.foodItems) ? pool.foodItems.map((item, index) => ({
    ...item,
    id: item.id || String(index),
  })) : []);
  const [saving, setSaving] = useState(false);

  const updateFoodItem = (id, changes) => {
    setFoodItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  const addFoodItem = () => {
    setFoodItems(current => current.concat([{
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      name: '',
      category: 'Platos regionales',
      description: '',
      price: '',
      imageUrl: '',
      imagePath: ''
    }]));
  };

  const removeFoodItem = id => {
    setFoodItems(current => {
      const target = current.find(item => item.id === id);
      if (target?.imagePreview?.startsWith('blob:')) URL.revokeObjectURL(target.imagePreview);
      return current.filter(item => item.id !== id);
    });
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!formData.lat || !formData.lng) {
      showNotification('Por favor marca la ubicación en el mapa', 'error');
      return;
    }
    setSaving(true);
    try {
      const poolsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pools');
      const targetRef = pool?.id ? doc(db, 'artifacts', appId, 'public', 'data', 'pools', pool.id) : doc(poolsRef);
      const poolId = targetRef.id;
      const savedFoodItems = formData.hasFood ? foodItems.filter(item => item.name.trim()).map(item => ({
          name: item.name.trim().slice(0, 80),
          category: item.category || 'Otros',
          description: (item.description || '').trim().slice(0, 240),
          price: item.price === '' ? null : Number(item.price),
          imageUrl: item.imageUrl || '',
          imagePath: item.imagePath || ''
      })) : [];

      const payload = {
        ownerId: pool?.ownerId || user.uid,
        name: formData.name.trim(),
        venueType: formData.venueType,
        hasKidsPool: Boolean(formData.hasKidsPool),
        openTime: formData.openTime,
        closeTime: formData.closeTime,
        price: Number(formData.price),
        hasFood: formData.hasFood,
        foodMenu: formData.hasFood ? formData.foodMenu.trim() : '',
        foodItems: savedFoodItems,
        images: formData.images,
        whatsapp: formData.whatsapp.trim(),
        lat: formData.lat,
        lng: formData.lng,
        isFull: pool ? pool.isFull : false,
        updatedAt: new Date().toISOString()
      };

      if (pool?.id) {
        await updateDoc(targetRef, payload);
        showNotification('Piscina actualizada correctamente', 'success');
      } else {
        await setDoc(targetRef, { ...payload, createdAt: new Date().toISOString() });
        showNotification('Establecimiento creado correctamente', 'success');
      }
      onClose();
    } catch (error) {
      console.error('Firebase save error:', error);
      const code = error?.code || 'unknown';
      const messages = {
        'permission-denied': 'Firebase rechazó el guardado. Revisa las reglas de Firestore y que tu cuenta esté aprobada.',
        'unauthenticated': 'Tu sesión expiró. Vuelve a iniciar sesión.',
        'unavailable': 'Firebase no está disponible temporalmente. Comprueba tu conexión e inténtalo otra vez.'
      };
      showNotification(messages[code] || ('No se pudo guardar: ' + (error?.message || 'error desconocido')), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full flex-1 overflow-y-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onClose} className="p-2 bg-[#1E293B] hover:bg-slate-700 rounded-full transition-colors">
          <X className="w-5 h-5 text-slate-300" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">{pool ? 'Editar establecimiento' : 'Nuevo establecimiento'}</h2>
          <p className="text-sm text-slate-400">Completa los datos que aparecerán en el directorio público.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 h-auto lg:h-[720px]">
        <form onSubmit={handleSubmit} className="flex-1 bg-[#1E293B] border border-slate-700 p-6 rounded-2xl shadow-xl overflow-y-auto space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Nombre del establecimiento</label>
            <input required type="text" maxLength={100} value={formData.name} onChange={event => setFormData({ ...formData, name: event.target.value })} className={inputClass} placeholder="Ej. Recreo El Bosque" />
          </div>

          <fieldset className="border border-slate-700 rounded-xl p-4">
            <legend className="px-2 text-sm font-semibold text-slate-300">Tipo de lugar</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input type="radio" name="venueType" value="pool" checked={formData.venueType === 'pool'} onChange={event => setFormData({ ...formData, venueType: event.target.value })} className="accent-cyan-500" />
                Piscina
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input type="radio" name="venueType" value="quebrada" checked={formData.venueType === 'quebrada'} onChange={event => setFormData({ ...formData, venueType: event.target.value })} className="accent-cyan-500" />
                Quebrada
              </label>
            </div>
            <label className="flex items-center gap-3 mt-4 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={formData.hasKidsPool} onChange={event => setFormData({ ...formData, hasKidsPool: event.target.checked })} className="w-5 h-5 accent-cyan-500" />
              Cuenta con piscina para niños
            </label>
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">Abre a las</label>
              <input required type="time" value={formData.openTime} onChange={event => setFormData({ ...formData, openTime: event.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">Cierra a las</label>
              <input required type="time" value={formData.closeTime} onChange={event => setFormData({ ...formData, closeTime: event.target.value })} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">Precio de entrada (S/)</label>
              <input required type="number" min="0" step="0.5" value={formData.price} onChange={event => setFormData({ ...formData, price: event.target.value })} className={inputClass} placeholder="0 para gratis" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">WhatsApp (+51)</label>
              <input type="tel" value={formData.whatsapp} onChange={event => setFormData({ ...formData, whatsapp: event.target.value })} className={inputClass} placeholder="Ej. 987654321" />
            </div>
          </div>

          <section className="border-t border-slate-700 pt-5">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input type="checkbox" checked={formData.hasFood} onChange={event => setFormData({ ...formData, hasFood: event.target.checked })} className="w-5 h-5 accent-cyan-500" />
              <span className="text-sm font-semibold text-slate-300">Este establecimiento ofrece comida</span>
            </label>
            {formData.hasFood && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-white">Carta de comidas</h3>
                    <p className="text-xs text-slate-400">Agrega cada plato con su categoría y precio.</p>
                  </div>
                  <button type="button" onClick={addFoodItem} className="flex items-center gap-2 rounded-lg bg-cyan-500/15 text-cyan-300 px-3 py-2 text-sm font-semibold hover:bg-cyan-500/25"><Plus className="w-4 h-4" /> Agregar plato</button>
                </div>
                {foodItems.length === 0 && <p className="text-sm text-slate-400 bg-slate-800/60 rounded-lg p-3">Todavía no agregaste platos. Puedes empezar con los platos regionales, pescados o bebidas.</p>}
                {foodItems.map((item, index) => (
                  <div key={item.id} className="border border-slate-700 rounded-xl p-3 space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-sm font-semibold text-white">Plato {index + 1}</p>
                      <button type="button" onClick={() => removeFoodItem(item.id)} className="text-rose-300 hover:text-rose-200 text-xs">Quitar plato</button>
                    </div>
                    <input value={item.name} onChange={event => updateFoodItem(item.id, { name: event.target.value })} maxLength={80} placeholder="Nombre del plato" className={inputClass} />
                    <div className="grid grid-cols-2 gap-3">
                      <select value={item.category || 'Platos regionales'} onChange={event => updateFoodItem(item.id, { category: event.target.value })} className={inputClass}>
                        {categories.map(category => <option key={category} value={category}>{category}</option>)}
                      </select>
                      <input type="number" min="0" step="0.5" value={item.price ?? ''} onChange={event => updateFoodItem(item.id, { price: event.target.value })} placeholder="Precio S/" className={inputClass} />
                    </div>
                    <textarea value={item.description || ''} onChange={event => updateFoodItem(item.id, { description: event.target.value })} maxLength={240} rows={2} placeholder="Descripción breve del plato" className={inputClass + ' resize-y'} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Información adicional del menú (opcional)</label>
                  <textarea value={formData.foodMenu} onChange={event => setFormData({ ...formData, foodMenu: event.target.value })} rows={2} maxLength={500} className={inputClass + ' resize-y'} placeholder="Ej. Atención de cocina hasta las 16:00, platos por temporada..." />
                </div>
              </div>
            )}
          </section>

          <button type="submit" disabled={saving} className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-3.5 rounded-xl shadow-lg transition-all disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar establecimiento'}
          </button>
        </form>

        <div className="flex-1 bg-[#1E293B] border border-slate-700 p-2 rounded-2xl shadow-xl flex flex-col min-h-[400px]">
          <div className="p-3 bg-slate-800/50 rounded-t-xl mb-2 flex items-start gap-3">
            <MapPin className="w-6 h-6 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Ubicación en el mapa</p>
              <p className="text-xs text-slate-400">Haz clic en el mapa para marcar exactamente dónde está tu piscina o quebrada.</p>
              {formData.lat != null && formData.lng != null && <p className="text-[11px] text-emerald-300 mt-1">Coordenadas: {Number(formData.lat).toFixed(5)}, {Number(formData.lng).toFixed(5)}</p>}
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-slate-700 relative">
            <MapComponent pools={[]} onMapClick={coords => setFormData(current => ({ ...current, lat: coords[0], lng: coords[1] }))} editingPosition={formData.lat != null && formData.lng != null ? [formData.lat, formData.lng] : null} />
            {formData.lat == null && (
              <div className="absolute inset-0 bg-black/40 z-[400] flex items-center justify-center pointer-events-none">
                <div className="bg-[#1E293B] px-4 py-2 rounded-full border border-cyan-500 text-cyan-400 font-medium animate-pulse shadow-lg">Toca el mapa para ubicar</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DropletIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>
    </svg>
  );
}

function InstallModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1E293B] border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-cyan-400" />
            Instalar App
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
          Para tener <strong>PisciMadre</strong> en tu pantalla de inicio como una aplicación, sigue estos pasos según tu celular:
        </p>

        <div className="space-y-4">
          <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-700">
            <h4 className="font-bold text-emerald-400 mb-2 flex items-center gap-2">🤖 En Android (Chrome)</h4>
            <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside ml-1">
              <li>Toca el menú de <strong>tres puntos</strong> (arriba a la derecha).</li>
              <li>Selecciona <strong>"Agregar a la pantalla principal"</strong>.</li>
              <li>Confirma tocando <strong>Agregar</strong>.</li>
            </ol>
          </div>

          <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-700">
            <h4 className="font-bold text-cyan-400 mb-2 flex items-center gap-2">🍎 En iPhone (Safari)</h4>
            <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside ml-1">
              <li>Toca el botón <strong>Compartir</strong> <Share className="w-4 h-4 inline-block mb-1" /> (abajo en el centro).</li>
              <li>Desliza hacia abajo y toca <strong>"Agregar a inicio"</strong>.</li>
              <li>Confirma tocando <strong>Agregar</strong>.</li>
            </ol>
          </div>
        </div>

        <button onClick={onClose} className="w-full mt-6 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3.5 rounded-xl transition-colors">
          Entendido
        </button>
      </div>
    </div>
  );
}
