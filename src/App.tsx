import React, { useState, useEffect } from 'react';
import { User, Currency, Machine, Investment, MachineCategory } from './types';
import { Homepage } from './components/Homepage';
import { CategoryTabs } from './components/CategoryTabs';
import { MachineCard } from './components/MachineCard';
import { MachineTableView } from './components/MachineTableView';
import { InvestModal } from './components/InvestModal';
import { AccountView } from './components/AccountView';
import { AuthModal } from './components/AuthModal';
import { WalletModal } from './components/WalletModal';
import { AdminPanel } from './components/AdminPanel';
import { WhatsAppWidget } from './components/WhatsAppWidget';
import { BottomNav } from './components/BottomNav';
import { Footer } from './components/Footer';
import { GatewayRegistration } from './components/GatewayRegistration';
import { LiveWallpaper } from './components/LiveWallpaper';
import { IncomePlaneView } from './components/IncomePlaneView';
import { checkAndSyncOwnerDevice } from './components/TopThreeDotMenu';
import { DEFAULT_MACHINES } from './data/defaultMachines';
import { CheckCircle2, ArrowRight, Cpu, AlertCircle } from 'lucide-react';

export default function App() {
  // Active Navigation Tab: 'home' | 'marketplace' | 'income' | 'profile' | 'admin'
  const [activeTab, setActiveTab] = useState<'home' | 'marketplace' | 'income' | 'profile' | 'account' | 'admin'>('home');
  const [currency, setCurrency] = useState<Currency>('UGX');

  // User State
  const [user, setUser] = useState<User | null>(null);

  // Machine Marketplace Data (Categorized into AV1, AV2, All Machines, and AVclasses)
  const [machines, setMachines] = useState<Machine[]>(DEFAULT_MACHINES);
  const [selectedCategory, setSelectedCategory] = useState<MachineCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [marketplaceViewMode, setMarketplaceViewMode] = useState<'table' | 'grid'>('grid');

  // User Portfolio Investments
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [invitedCount, setInvitedCount] = useState<number>(0);

  // Modal States
  const [selectedMachineToInvest, setSelectedMachineToInvest] = useState<Machine | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [walletMode, setWalletMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [referralCodeFromUrl, setReferralCodeFromUrl] = useState<string>('');

  // Gateway Registration is imparted as the entry screen when not logged in
  const [isGuestPreview, setIsGuestPreview] = useState<boolean>(false);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const syncUserToStorage = (u: User | null) => {
    setUser(u);
    try {
      if (u) {
        localStorage.setItem('avor_invest_user', JSON.stringify(u));
        localStorage.setItem('avor_invest_has_account', 'true');
        if (u.phone_number) {
          localStorage.setItem('avor_invest_last_phone', u.phone_number);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchMachines();

    // Always require the user to sign in via the Gateway when opening or reopening the link.
    // Do not auto-authenticate into the homepage from localStorage.
    setUser(null);
    setIsGuestPreview(false);

    // Check for referral code in URL (e.g. /reg?code=thkjve or ?AvorInvest=...)
    const searchParams = new URLSearchParams(window.location.search);
    const codeParam =
      searchParams.get('AvorInvest') ||
      searchParams.get('MachineInvest') ||
      searchParams.get('CreativeAssembly') ||
      searchParams.get('code') ||
      searchParams.get('ref');
    const isRegPath = window.location.pathname.startsWith('/reg');

    if (codeParam || isRegPath) {
      const codeToUse = codeParam || 'thkjve';
      setReferralCodeFromUrl(codeToUse);
      setIsGuestPreview(false);
      showNotification(`Invitation code "${codeToUse}" verified! Register below to get started.`, 'info');
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchUserData();
    fetchUserPortfolio();
    const interval = setInterval(() => {
      fetchUserData();
      fetchUserPortfolio();
    }, 4000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Unlock WhatsApp, Company PDF, Invite, and Manage once the user buys a machine
  const hasBoughtMachine =
    investments.some((i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE') ||
    Boolean(user?.has_bought_machine);

  const CLASS_INVITE_REQUIREMENTS: Record<string, number> = {
    'A class': 4,
    'B class': 9,
    'C class': 20,
    'D class': 35,
    'E class': 70,
    'F class': 120,
    'G class': 300,
    'H class': 5000,
    'I class': 10000,
  };

  const handleSelectMachineToBuy = (m: Machine) => {
    if (!user) {
      setIsGuestPreview(false);
      setShowAuthModal(true);
      return;
    }

    const series = m.series_tag || m.series || '';
    const isClosedOrLockedPlane =
      !!m.is_av_class ||
      !!m.category?.startsWith('AV_CLASS') ||
      ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(series);

    if (isClosedOrLockedPlane) {
      const requiredInvites = Number(
        m.required_referral_buyers || CLASS_INVITE_REQUIREMENTS[series] || 4
      );
      if (!hasBoughtMachine) {
        showNotification(
          `🔒 Class Locked: Buy a machine first and invite ${requiredInvites.toLocaleString()} people to unlock ${series || m.title} (Currently ${invitedCount}/${requiredInvites.toLocaleString()} invited).`,
          'error'
        );
        return;
      }
      if (invitedCount < requiredInvites) {
        const remaining = requiredInvites - invitedCount;
        showNotification(
          `🔒 ${series || m.title} Locked: You must invite ${requiredInvites.toLocaleString()} people to access ${series || m.title} (${invitedCount}/${requiredInvites.toLocaleString()} invited — invite ${remaining.toLocaleString()} more).`,
          'error'
        );
        return;
      }
    }

    setSelectedMachineToInvest(m);
  };

  const fetchMachines = async () => {
    try {
      const res = await fetch('/api/machines');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMachines(data);
        }
      }
    } catch {
      // Fallback to DEFAULT_MACHINES if backend is momentarily unreachable
    }
  };

  const fetchUserPortfolio = async () => {
    if (!user) return;
    try {
      const phoneParam = user.phone_number ? `?phone=${encodeURIComponent(user.phone_number)}` : '';
      const res = await fetch(`/api/user/portfolio/${encodeURIComponent(user.id)}${phoneParam}`);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setInvestments(data);
        }
      }
    } catch {
      // Keep existing portfolio state if backend is momentarily unreachable
    }
  };

  const fetchUserData = async () => {
    if (!user) return;
    try {
      const phoneParam = user.phone_number ? `?phone=${encodeURIComponent(user.phone_number)}` : '';
      const [res, sumRes] = await Promise.all([
        fetch(`/api/user/${encodeURIComponent(user.id)}${phoneParam}`),
        fetch(`/api/user/dashboard-summary/${encodeURIComponent(user.id)}${phoneParam}`),
      ]);
      const ct = res.headers.get('content-type') || '';
      let mergedUser: User = { ...user };
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data && data.id) {
          mergedUser = { ...mergedUser, ...data };
        }
      }
      const sumCt = sumRes.headers.get('content-type') || '';
      if (sumRes.ok && sumCt.includes('application/json')) {
        const sumData = await sumRes.json();
        setInvitedCount(Number(sumData.active_buyer_referrals ?? sumData.invited_people_count ?? 0));
        if (typeof sumData.balance === 'number') mergedUser.balance = sumData.balance;
        if (typeof sumData.wallet_balance === 'number') mergedUser.wallet_balance = sumData.wallet_balance;
        if (typeof sumData.available_wallet === 'number') mergedUser.available_wallet = sumData.available_wallet;
        if (typeof sumData.has_bought_machine === 'boolean') mergedUser.has_bought_machine = sumData.has_bought_machine;
      }
      syncUserToStorage(mergedUser);
    } catch {
      // Keep existing user session if backend is momentarily unreachable
    }
  };

  const handleClaimYield = async (investmentId?: string) => {
    if (!user) {
      setIsGuestPreview(false);
      setShowAuthModal(true);
      return;
    }
    try {
      const res = await fetch('/api/user/claim-yield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_phone: user.phone_number,
          user_name: user.full_name,
          investment_id: investmentId,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : {};

      if (res.ok) {
        syncUserToStorage({ ...user, balance: data.new_balance });
        fetchUserPortfolio();
        showNotification(`Claimed ${Number(data.claimed_amount || 0).toLocaleString()} UGX daily return yield!`);
      } else {
        showNotification(data.error || 'No unclaimed yield ready right now.', 'info');
      }
    } catch {
      showNotification('Yield claim is syncing. Please try again in a moment.', 'info');
    }
  };

  const handleLogout = () => {
    syncUserToStorage(null);
    setInvestments([]);
    setActiveTab('home');
    setIsGuestPreview(false);
    showNotification('Logged out successfully.', 'info');
  };

  // Filtered Machines
  const filteredMachines = machines.filter((m) => {
    const categoryMatch =
      selectedCategory === 'ALL'
        ? true
        : selectedCategory === 'AVS'
          ? !m.is_av_class && (m.series_tag === 'AV1' || m.series_tag === 'AV2' || m.category === 'AV1' || m.category === 'AV2')
          : selectedCategory === 'AVCLASSES'
            ? !!m.is_av_class || ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(m.series_tag) || m.category?.startsWith('AV_CLASS')
            : m.category === selectedCategory ||
              (selectedCategory === 'AV1' && (m.series_tag === 'AV1' || m.series === 'AV1' || m.category === 'AV1')) ||
              (selectedCategory === 'AV2' && (m.series_tag === 'AV2' || m.series === 'AV2' || m.category === 'AV2')) ||
              (selectedCategory === 'AV_CLASS_A' && (m.category === 'AV_CLASS_A' || m.series_tag === 'A class' || m.series?.includes('A class'))) ||
              (selectedCategory === 'AV_CLASS_B' && (m.category === 'AV_CLASS_B' || m.series_tag === 'B class' || m.series?.includes('B class'))) ||
              (selectedCategory === 'AV_CLASS_C' && (m.category === 'AV_CLASS_C' || m.series_tag === 'C class' || m.series?.includes('C class'))) ||
              (selectedCategory === 'AV_CLASS_D' && (m.category === 'AV_CLASS_D' || m.series_tag === 'D class' || m.series?.includes('D class'))) ||
              (selectedCategory === 'AV_CLASS_E' && (m.category === 'AV_CLASS_E' || m.series_tag === 'E class' || m.series?.includes('E class'))) ||
              (selectedCategory === 'AV_CLASS_F' && (m.category === 'AV_CLASS_F' || m.series_tag === 'F class' || m.series?.includes('F class'))) ||
              (selectedCategory === 'AV_CLASS_G' && (m.category === 'AV_CLASS_G' || m.series_tag === 'G class' || m.series?.includes('G class'))) ||
              (selectedCategory === 'AV_CLASS_H' && (m.category === 'AV_CLASS_H' || m.series_tag === 'H class' || m.series?.includes('H class'))) ||
              (selectedCategory === 'AV_CLASS_I' && (m.category === 'AV_CLASS_I' || m.series_tag === 'I class' || m.series?.includes('I class')));

    const searchMatch =
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.series_tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.series || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase());

    return categoryMatch && searchMatch;
  });

  return (
    <div className="min-h-screen bg-transparent text-slate-100 font-sans antialiased flex flex-col justify-between selection:bg-blue-600 selection:text-white relative">
      {/* Live Moving Wallpaper Background */}
      <LiveWallpaper />

      {/* Toast Notification Popup */}
      {toast && (
        <div
          className={`fixed top-20 right-4 left-4 sm:left-auto sm:max-w-md z-[60] shining-card text-white border-l-4 ${
            toast.type === 'error'
              ? 'border-rose-500 bg-rose-950/95 shadow-rose-950/60'
              : 'border-blue-500'
          } p-4 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-semibold animate-fade-in`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div>
        {/* Main Content Area */}
        <main className="content max-w-7xl mx-auto w-full p-4 sm:p-8 pt-6 sm:pt-10">
          {/* Unauthenticated Gateway Screen (Imparted as Primary Entrypoint) */}
          {!user ? (
            <GatewayRegistration
              initialReferralCode={referralCodeFromUrl}
              onCurrencyChange={setCurrency}
              onSuccess={(loggedInUser, mode) => {
                syncUserToStorage(loggedInUser);
                setIsGuestPreview(false);
                if (mode === 'login') {
                  showNotification(`Welcome back to Avor invest, ${loggedInUser.full_name}!`);
                } else {
                  showNotification(`Welcome to Avor invest, ${loggedInUser.full_name}! You received a 3,000 UGX registration reward on your Balance.`);
                }
                setActiveTab('home');
              }}
            />
          ) : (
            <>
              {activeTab === 'home' && (
                <Homepage
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  user={user}
                  machines={machines}
                  investments={investments}
                  onSelectMachine={(m) => handleSelectMachineToBuy(m)}
                  onNavigateToMarketplace={(categoryFilter) => {
                    if (categoryFilter) {
                      setSelectedCategory(categoryFilter);
                    }
                    setActiveTab('marketplace');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onNavigateToIncome={() => setActiveTab('income')}
                  onNavigateToAdmin={() => {
                    if (checkAndSyncOwnerDevice(user)) {
                      setActiveTab('admin');
                    }
                  }}
                  onOpenAuth={() => setIsGuestPreview(false)}
                  onNavigateToAccount={() => setActiveTab('profile')}
                  onOpenWallet={(type) => {
                    if (!user) {
                      setIsGuestPreview(false);
                      setShowAuthModal(true);
                    } else {
                      setWalletMode(type);
                      setShowWalletModal(true);
                    }
                  }}
                />
              )}

              {activeTab === 'marketplace' && (
                <div className="space-y-4">
                  <CategoryTabs
                    selectedCategory={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    viewMode={marketplaceViewMode}
                    onViewModeChange={setMarketplaceViewMode}
                    hasBoughtMachine={hasBoughtMachine}
                    invitedCount={invitedCount}
                    onLockedPlaneNotify={(msg) => showNotification(msg, 'error')}
                  />

                  {marketplaceViewMode === 'table' ? (
                    <MachineTableView
                      machines={filteredMachines}
                      currency={currency}
                      hasBoughtMachine={hasBoughtMachine}
                      invitedCount={invitedCount}
                      onInvestClick={(m) => handleSelectMachineToBuy(m)}
                    />
                  ) : filteredMachines.length === 0 ? (
                    <div className="shining-card rounded-2xl p-12 text-center border border-blue-950/80 space-y-3">
                      <Cpu className="w-10 h-10 text-slate-500 mx-auto" />
                      <h3 className="text-base font-bold text-white">No Equipment Units Found</h3>
                      <p className="text-xs text-slate-400">
                        No machines match your selected category or search filter.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedCategory('ALL');
                          setSearchQuery('');
                        }}
                        className="px-4 py-2 bg-[#070e1f] hover:bg-[#0d1733] border border-blue-900/50 text-blue-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Reset Search & Filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 max-w-5xl mx-auto">
                      {filteredMachines.map((machine) => (
                        <MachineCard
                          key={machine.id}
                          machine={machine}
                          currency={currency}
                          hasBoughtMachine={hasBoughtMachine}
                          invitedCount={invitedCount}
                          onInvestClick={(m) => handleSelectMachineToBuy(m)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'income' && (
                <IncomePlaneView
                  user={user}
                  investments={investments}
                  currency={currency}
                  onClaimYield={handleClaimYield}
                  onNavigateToMarketplace={() => setActiveTab('marketplace')}
                  onOpenAuth={() => {
                    setIsGuestPreview(false);
                    setShowAuthModal(true);
                  }}
                  onRefresh={fetchUserPortfolio}
                />
              )}

              {(activeTab === 'profile' || activeTab === 'account' || (activeTab as string) === 'referrals') && (
                <AccountView
                  user={user}
                  investments={investments}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  onLogout={handleLogout}
                  initialTab={(activeTab as string) === 'referrals' ? 'invite' : 'profile'}
                  onClaimYield={handleClaimYield}
                  onOpenWalletModal={(mode) => {
                    if (!user) {
                      setIsGuestPreview(false);
                      setShowAuthModal(true);
                    } else {
                      setWalletMode(mode);
                      setShowWalletModal(true);
                    }
                  }}
                  onUpdateUser={(updatedUser) => syncUserToStorage(updatedUser)}
                  onOpenAuth={() => {
                    setIsGuestPreview(false);
                    setShowAuthModal(true);
                  }}
                  onNavigateToMarketplace={() => setActiveTab('marketplace')}
                />
              )}

              {activeTab === 'admin' && checkAndSyncOwnerDevice(user) && (
                <AdminPanel
                  onExitAdmin={() => setActiveTab('home')}
                  onDataChanged={() => {
                    fetchUserData();
                    fetchUserPortfolio();
                    fetchMachines();
                  }}
                  onMachineCreated={() => {
                    fetchMachines();
                    showNotification('New machine added to live marketplace!');
                    setActiveTab('marketplace');
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Show WhatsApp Widget, Bottom Navigation Bar, and Footer only when signed in */}
      {user && (
        <>
          <WhatsAppWidget
            hasBoughtMachine={hasBoughtMachine}
            onExploreMachines={() => setActiveTab('marketplace')}
          />

          <BottomNav
            activeTab={activeTab}
            hasBoughtMachine={hasBoughtMachine}
            onTabChange={(tab: any) => {
              const target = tab === 'account' || tab === 'referrals' ? 'profile' : tab;
              if (target === 'admin' && !checkAndSyncOwnerDevice(user)) {
                setActiveTab('home');
                return;
              }
              setActiveTab(target);
            }}
            user={user}
            onOpenAuth={() => setIsGuestPreview(false)}
            onOpenWallet={(mode) => {
              setWalletMode(mode);
              setShowWalletModal(true);
            }}
          />

          <div className="pb-16">
            <Footer
              hasBoughtMachine={hasBoughtMachine}
              onNavigateToMarketplace={() => setActiveTab('marketplace')}
            />
          </div>
        </>
      )}

      {/* Modals */}
      {selectedMachineToInvest && (
        <InvestModal
          machine={selectedMachineToInvest}
          currency={currency}
          user={user}
          userInvestments={investments}
          onClose={() => setSelectedMachineToInvest(null)}
          onDepositSubmitted={() => {
            fetchUserData();
            fetchUserPortfolio();
          }}
          onSuccess={() => {
            fetchUserPortfolio();
            fetchMachines();
            fetchUserData();
            showNotification('Machine bought and activated (Day 1) using your Admin-approved wallet balance!');
            setActiveTab('income');
          }}
          onOpenAuth={() => {
            setSelectedMachineToInvest(null);
            setIsGuestPreview(false);
            setShowAuthModal(true);
          }}
          onOpenDeposit={() => {
            setSelectedMachineToInvest(null);
            setWalletMode('deposit');
            setShowWalletModal(true);
          }}
          onNotify={(msg, type) => showNotification(msg, type || 'error')}
        />
      )}

      {showAuthModal && (
        <AuthModal
          initialReferralCode={referralCodeFromUrl}
          onClose={() => setShowAuthModal(false)}
          onCurrencyChange={setCurrency}
          onLoginSuccess={(loggedInUser) => {
            syncUserToStorage(loggedInUser);
            setIsGuestPreview(false);
            setShowAuthModal(false);
            showNotification(`Welcome to Avor invest, ${loggedInUser.full_name}!`);
            setActiveTab('home');
          }}
        />
      )}

      {showWalletModal && user && (
        <WalletModal
          user={user}
          currency={currency}
          initialMode={walletMode}
          hasBoughtMachine={hasBoughtMachine}
          userInvestments={investments}
          onClose={() => setShowWalletModal(false)}
          onRefreshUser={() => {
            fetchUserData();
            fetchUserPortfolio();
          }}
          onNavigateToMarketplace={() => setActiveTab('marketplace')}
        />
      )}
    </div>
  );
}
