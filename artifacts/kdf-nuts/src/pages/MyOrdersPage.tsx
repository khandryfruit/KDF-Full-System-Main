import React, { useState } from 'react';
import { ArrowLeft, Package, ChevronRight, Search, FileText } from 'lucide-react';
import { useLocation } from 'wouter';
import { fetchAndPrintInvoice } from '../lib/orderInvoice';
import { BottomNav } from '../components/BottomNav';
import { useApp } from '../context/AppContext';
import { useListOrders } from '@workspace/api-client-react';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:          { bg: 'bg-yellow-50',   text: 'text-yellow-700',  label: 'Pending' },
  processing:       { bg: 'bg-blue-50',     text: 'text-blue-700',    label: 'Processing' },
  shipped:          { bg: 'bg-indigo-50',   text: 'text-indigo-700',  label: 'Shipped' },
  out_for_delivery: { bg: 'bg-orange-50',   text: 'text-orange-700',  label: 'Out for Delivery' },
  delivered:        { bg: 'bg-[#eef7e6]',   text: 'text-[#5FA800]',   label: 'Delivered' },
  cancelled:        { bg: 'bg-red-50',      text: 'text-red-600',     label: 'Cancelled' },
};

const FILTERS = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export function MyOrdersPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useApp();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const { data, isLoading } = useListOrders(
    { limit: 50 },
    { query: { enabled: isAuthenticated, refetchInterval: 30000 } as any }
  );

  const allOrders: any[] = (data as any)?.items ?? [];

  const filtered = allOrders.filter(o => {
    const matchSearch = !search ||
      (o.orderNumber ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = activeFilter === 'All' || o.status.toLowerCase() === activeFilter.toLowerCase();
    return matchSearch && matchFilter;
  });

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans">
      {/* Header */}
      <div className="bg-white sticky top-0 z-20 px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setLocation('/account')} className="p-2 -ml-2 rounded-full active:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">My Orders</h1>
          {!isLoading && <span className="text-xs text-gray-400 font-medium">{allOrders.length} orders</span>}
        </div>
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by order# or name..."
            className="w-full pl-9 pr-4 py-2.5 bg-[#F8F9FB] rounded-xl text-sm border border-gray-100 focus:outline-none focus:border-[#5FA800]/40 placeholder:text-gray-400"
          />
        </div>
        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-0.5">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                activeFilter === f
                  ? 'bg-[#5FA800] text-white border-[#5FA800]'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Loading */}
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
            <div className="flex justify-between mb-3">
              <div className="w-28 h-4 bg-gray-100 rounded-full" />
              <div className="w-20 h-5 bg-gray-100 rounded-full" />
            </div>
            <div className="w-40 h-3 bg-gray-100 rounded-full mb-3" />
            <div className="flex justify-between">
              <div className="w-20 h-5 bg-gray-100 rounded-full" />
              <div className="w-16 h-8 bg-gray-100 rounded-xl" />
            </div>
          </div>
        ))}

        {/* Not logged in */}
        {!isAuthenticated && !isLoading && (
          <div className="text-center py-16">
            <Package className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="font-semibold text-gray-700 mb-1">Login to view orders</p>
            <p className="text-sm text-gray-400 mb-5">Track and manage all your orders</p>
            <button onClick={() => setLocation('/login')} className="bg-[#5FA800] text-white font-bold px-6 py-3 rounded-xl text-sm">
              Login / Sign Up
            </button>
          </div>
        )}

        {/* Empty */}
        {isAuthenticated && !isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="font-semibold text-gray-700 mb-1">
              {search || activeFilter !== 'All' ? 'No matching orders' : 'No orders yet'}
            </p>
            <p className="text-sm text-gray-400 mb-5">
              {search || activeFilter !== 'All' ? 'Try a different filter' : 'Start shopping to place your first order'}
            </p>
            {!search && activeFilter === 'All' && (
              <button onClick={() => setLocation('/home')} className="bg-[#5FA800] text-white font-bold px-6 py-3 rounded-xl text-sm">
                Shop Now
              </button>
            )}
          </div>
        )}

        {/* Orders list */}
        {filtered.map(order => {
          const s = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
          const date = order.createdAt
            ? new Date(order.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })
            : '';
          const total = Number(order.total || order.totalAmount || 0);
          const itemCount = order.items?.length ?? 0;
          const orderNum = order.orderNumber ?? `KDF-${String(order.id).padStart(6, '0')}`;
          return (
            <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-gray-900 text-sm">#{orderNum}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{date}</p>
                  {itemCount > 0 && <p className="text-xs text-gray-400">{itemCount} item{itemCount !== 1 ? 's' : ''}</p>}
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                <p className="font-bold text-gray-900">₨{total.toLocaleString()}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchAndPrintInvoice(order.id)}
                    className="flex items-center gap-1 text-gray-500 text-xs font-semibold border border-gray-200 bg-gray-50 px-2.5 py-1.5 rounded-lg active:bg-gray-100 transition-colors"
                  >
                    <FileText className="w-3 h-3" /> Invoice
                  </button>
                  <button
                    onClick={() => setLocation(`/order/${order.id}/tracking`)}
                    className="flex items-center gap-1.5 text-[#5FA800] text-xs font-semibold border border-[#5FA800]/30 bg-[#5FA800]/5 px-3 py-1.5 rounded-lg active:bg-[#eef7e6] transition-colors"
                  >
                    Track <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}
