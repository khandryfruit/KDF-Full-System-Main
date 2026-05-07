import React from 'react';
import { Home, LayoutGrid, ShoppingCart, Package, User } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useCart } from '../context/CartContext';

export function BottomNav() {
  const [location] = useLocation();
  const { totalItems } = useCart();

  const navItems = [
    { id: 'home',       path: '/home',       icon: Home,         label: 'Home' },
    { id: 'categories', path: '/categories', icon: LayoutGrid,   label: 'Categories' },
    { id: 'cart',       path: '/cart',       icon: ShoppingCart, label: 'Cart',  badge: totalItems > 0 ? totalItems : null },
    { id: 'track',      path: '/track',      icon: Package,      label: 'Track' },
    { id: 'account',    path: '/account',    icon: User,         label: 'Account' },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 flex items-center justify-between px-6 py-2 pb-5 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      {navItems.map((item) => {
        const isActive = location === item.path || (item.id === 'track' && location.startsWith('/track'));
        return (
          <Link
            key={item.id}
            href={item.path}
            className={`flex flex-col items-center gap-1 p-2 transition-colors relative ${isActive ? 'text-[#5FA800]' : 'text-gray-400 hover:text-[#5FA800]'}`}
          >
            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            {item.badge !== null && item.badge !== undefined && (
              <span className="absolute top-1 right-1 bg-[#F58300] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                {item.badge}
              </span>
            )}
            <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
