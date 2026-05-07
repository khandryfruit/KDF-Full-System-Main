import React from "react";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Gift, ShoppingBag, Users } from "lucide-react";
import { useLocation } from "wouter";
import { BottomNav } from "../components/BottomNav";
import { useApp } from "../context/AppContext";
import {
  useGetWalletBalance,
  useGetWalletTransactions,
  useGetLoyaltyBalance,
  useGetLoyaltyTransactions,
} from "@workspace/api-client-react";

export function WalletPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useApp();

  const { data: walletBalance } = useGetWalletBalance({ query: { enabled: isAuthenticated } as any });
  const { data: walletTxData } = useGetWalletTransactions({ limit: 5 }, { query: { enabled: isAuthenticated } as any });
  const { data: loyaltyBalance } = useGetLoyaltyBalance({ query: { enabled: isAuthenticated } as any });
  const { data: loyaltyTxData } = useGetLoyaltyTransactions({ page: 1 }, { query: { enabled: isAuthenticated } as any });

  const balance = walletBalance ? Number(walletBalance.balance) : 0;
  const loyaltyPoints = loyaltyBalance?.points ?? 0;
  const loyaltyValue = loyaltyBalance ? Number(loyaltyBalance.value) : 0;
  const loyaltyTier = loyaltyBalance?.tier ?? 'Bronze';

  // Determine next tier threshold from current tier
  const tierThresholds: Record<string, number> = { Bronze: 1000, Silver: 5000, Gold: 15000, Platinum: 50000 };
  const loyaltyNextTier = tierThresholds[loyaltyTier] ?? 5000;
  const tierProgress = loyaltyNextTier > 0 ? Math.min((loyaltyPoints / loyaltyNextTier) * 100, 100) : 0;

  const walletTransactions = walletTxData?.items ?? [];
  const loyaltyTransactions = loyaltyTxData?.items ?? [];

  const allTransactions = [
    ...walletTransactions.map((t: any) => ({
      id: `w-${t.id}`,
      type: t.type === 'credit' ? 'earn' : 'spend' as 'earn' | 'spend',
      title: t.description || (t.type === 'credit' ? 'Wallet Credit' : 'Wallet Debit'),
      date: new Date(t.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' }),
      amount: `${t.type === 'credit' ? '+' : '-'}₨${Number(t.amount).toLocaleString()}`,
    })),
    ...loyaltyTransactions.map((t: any) => ({
      id: `l-${t.id}`,
      type: t.type === 'credit' ? 'earn' : 'spend' as 'earn' | 'spend',
      title: t.description || (t.type === 'credit' ? 'Points Earned' : 'Points Redeemed'),
      date: new Date(t.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' }),
      amount: `${t.type === 'credit' ? '+' : '-'}${t.points} pts`,
    })),
  ].slice(0, 8);

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans relative">
      <div className="bg-white sticky top-0 z-20 flex items-center px-4 py-4 border-b border-gray-100">
        <button onClick={() => setLocation('/account')} className="p-2 -ml-2 rounded-full active:bg-gray-100 text-gray-900 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 ml-2">Wallet & Loyalty Points</h1>
      </div>

      <div className="p-5 space-y-5">
        {/* Wallet Card */}
        <div className="bg-gradient-to-br from-[#3d6e00] to-[#5FA800] rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-black/10 rounded-full blur-xl" />
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-6">
              <span className="text-white/80 font-medium tracking-wide text-sm">KDF Wallet</span>
              <span className="bg-white/20 backdrop-blur-sm text-xs font-semibold px-2 py-1 rounded">Active</span>
            </div>
            <div className="mb-8">
              <span className="text-3xl font-bold tracking-tight">₨{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex gap-3">
              <button className="flex-1 bg-white text-[#5FA800] font-semibold py-2.5 rounded-full text-sm active:bg-gray-100 transition-colors">Add Money</button>
              <button className="flex-1 border border-white/40 text-white font-semibold py-2.5 rounded-full text-sm active:bg-white/10 transition-colors">Withdraw</button>
            </div>
          </div>
        </div>

        {/* Loyalty Points Card */}
        <div className="bg-gradient-to-br from-[#F58300] to-[#ff9b28] rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full translate-x-8 -translate-y-8" />
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-white/90 font-medium text-sm block mb-1">Loyalty Points</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">{loyaltyPoints.toLocaleString()}</span>
                  <span className="text-white/80 text-sm font-medium">pts</span>
                </div>
                <p className="text-white/80 text-xs mt-1 font-medium">= ₨{loyaltyValue.toLocaleString()} value</p>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-xs font-semibold mb-2">
                <span>{loyaltyTier} Tier</span>
                <span>{loyaltyNextTier.toLocaleString()} for next</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${tierProgress}%` }} />
              </div>
              <p className="text-[10px] text-white/70 mt-2 text-right">{loyaltyPoints.toLocaleString()} / {loyaltyNextTier.toLocaleString()} pts</p>
            </div>
            <button className="w-full bg-white text-[#F58300] font-semibold py-2.5 rounded-full text-sm active:bg-gray-100 transition-colors">
              Redeem Points
            </button>
          </div>
        </div>

        {/* How to Earn */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-3 px-1">How to earn points</h2>
          <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
            <div className="flex items-center p-3">
              <div className="w-10 h-10 rounded-full bg-[#f2f8ec] flex items-center justify-center mr-3 text-[#5FA800]"><ShoppingBag className="w-5 h-5" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Purchase items</p>
                <p className="text-xs text-gray-500">Earn 1pt for every ₨10 spent</p>
              </div>
            </div>
            <div className="h-px bg-gray-50 mx-4" />
            <div className="flex items-center p-3">
              <div className="w-10 h-10 rounded-full bg-[#fff4e5] flex items-center justify-center mr-3 text-[#F58300]"><Gift className="w-5 h-5" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Leave a review</p>
                <p className="text-xs text-gray-500">Earn 50pts per approved review</p>
              </div>
            </div>
            <div className="h-px bg-gray-50 mx-4" />
            <div className="flex items-center p-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mr-3 text-blue-500"><Users className="w-5 h-5" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Refer a friend</p>
                <p className="text-xs text-gray-500">Earn 200pts when they purchase</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div>
          <div className="flex justify-between items-end mb-3 px-1">
            <h2 className="text-base font-bold text-gray-900">Recent Transactions</h2>
            <button className="text-[#5FA800] text-xs font-semibold active:opacity-70 transition-opacity">View All</button>
          </div>
          <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
            {allTransactions.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">No transactions yet</p>
            ) : (
              allTransactions.map((tx, i) => (
                <React.Fragment key={tx.id}>
                  {i > 0 && <div className="h-px bg-gray-50 mx-4" />}
                  <TransactionItem type={tx.type} title={tx.title} date={tx.date} amount={tx.amount} />
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function TransactionItem({ type, title, date, amount }: { type: 'earn' | 'spend', title: string, date: string, amount: string }) {
  const isEarn = type === 'earn';
  return (
    <div className="flex items-center justify-between p-3">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isEarn ? 'bg-[#eef7e6] text-[#5FA800]' : 'bg-gray-100 text-gray-500'}`}>
          {isEarn ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{date}</p>
        </div>
      </div>
      <span className={`text-sm font-bold ${isEarn ? 'text-[#5FA800]' : 'text-gray-900'}`}>{amount}</span>
    </div>
  );
}
