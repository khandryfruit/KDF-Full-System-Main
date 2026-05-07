import React from 'react';
import { ArrowLeft, Bell, Package, Tag, Megaphone, Gift, Check, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { BottomNav } from '../components/BottomNav';
import { useGetMyNotifications } from '@workspace/api-client-react';
import type { PushNotification } from '@workspace/api-client-react';

const TYPE_ICON: Record<string, React.ReactNode> = {
  order_update: <Package className="w-5 h-5 text-blue-600" />,
  promotion:    <Tag className="w-5 h-5 text-[#F58300]" />,
  general:      <Megaphone className="w-5 h-5 text-gray-500" />,
};

const TYPE_BG: Record<string, string> = {
  order_update: 'bg-blue-50',
  promotion:    'bg-orange-50',
  general:      'bg-gray-100',
};

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60)  return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function NotificationsPage() {
  const [, setLocation] = useLocation();

  const { data, isLoading, refetch, isRefetching } = useGetMyNotifications(
    { limit: 50 },
    { query: { queryKey: ['my-notifications'], refetchOnMount: true } }
  );

  const items: PushNotification[] = data?.items ?? [];

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans">
      {/* Header */}
      <div className="bg-white sticky top-0 z-20 px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation('/account')}
            className="p-2 -ml-2 rounded-full active:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">Notifications</h1>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 rounded-full active:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-[#5FA800] ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {items.length > 0 && (
          <p className="text-xs text-gray-400 mt-1 pl-1">{items.length} notification{items.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      <div className="p-4 space-y-2">
        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-40" />
                    <div className="h-3 bg-gray-100 rounded w-56" />
                    <div className="h-3 bg-gray-100 rounded w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && items.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-10 h-10 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-700 mb-1">No notifications yet</p>
            <p className="text-sm text-gray-400">We'll notify you about orders and offers</p>
          </div>
        )}

        {/* Notification cards */}
        {!isLoading && items.map(n => {
          const typeKey = n.type as string;
          const icon   = TYPE_ICON[typeKey]  ?? <Bell className="w-5 h-5 text-gray-500" />;
          const bg     = TYPE_BG[typeKey]    ?? 'bg-gray-100';
          const time   = n.sentAt ? timeAgo(n.sentAt) : (n.createdAt ? timeAgo(n.createdAt) : '');

          return (
            <div
              key={n.id}
              className="relative bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${bg}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 mb-0.5 leading-snug">{n.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{n.message}</p>
                  {time && <p className="text-[11px] text-gray-400 mt-1.5 font-medium">{time}</p>}
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
