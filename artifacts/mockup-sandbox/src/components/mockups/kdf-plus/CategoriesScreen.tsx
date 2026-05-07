import React, { useState } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Home as HomeIcon, 
  Heart,
  LayoutGrid,
  User,
  Laptop, 
  Shirt, 
  Sparkles, 
  Dumbbell, 
  ShoppingBag, 
  Gift, 
  BookOpen,
  Car,
  Activity,
  Diamond,
  Baby,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import './_group.css';

const BG_COLOR = '#F8F9FB';

export function CategoriesScreen() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const allCategories = [
    { id: 'electronics', icon: Laptop, label: 'Electronics', count: '1,240 items', color: 'bg-green-100 text-[#5FA800]' },
    { id: 'fashion', icon: Shirt, label: 'Fashion', count: '3,850 items', color: 'bg-orange-100 text-[#F58300]' },
    { id: 'home', icon: HomeIcon, label: 'Home & Living', count: '920 items', color: 'bg-emerald-100 text-emerald-600' },
    { id: 'beauty', icon: Sparkles, label: 'Beauty', count: '1,500 items', color: 'bg-amber-100 text-amber-600' },
    { id: 'sports', icon: Dumbbell, label: 'Sports', count: '430 items', color: 'bg-[#5FA800]/10 text-[#5FA800]' },
    { id: 'groceries', icon: ShoppingBag, label: 'Groceries', count: '2,100 items', color: 'bg-[#F58300]/10 text-[#F58300]' },
    { id: 'toys', icon: Gift, label: 'Toys & Kids', count: '890 items', color: 'bg-green-100 text-green-700' },
    { id: 'books', icon: BookOpen, label: 'Books', count: '5,400 items', color: 'bg-yellow-100 text-yellow-700' },
    { id: 'automotive', icon: Car, label: 'Automotive', count: '320 items', color: 'bg-stone-100 text-stone-700' },
    { id: 'health', icon: Activity, label: 'Health', count: '650 items', color: 'bg-rose-100 text-rose-600' },
    { id: 'jewelry', icon: Diamond, label: 'Jewelry', count: '410 items', color: 'bg-cyan-100 text-cyan-600' },
    { id: 'baby', icon: Baby, label: 'Baby Products', count: '780 items', color: 'bg-indigo-100 text-indigo-600' },
  ];

  const subCategories = ['Phones', 'Laptops', 'Tablets', 'Headphones', 'Cameras', 'Accessories'];

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-[100dvh] pb-20 relative font-sans" style={{ backgroundColor: BG_COLOR }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Categories</h1>
        <div className="flex items-center gap-3 text-gray-600">
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><Search size={22} /></button>
        </div>
      </header>

      <main className="flex flex-col gap-6 pt-4 px-4 overflow-x-hidden">
        
        {/* Featured Banners */}
        <section className="grid grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl bg-gradient-to-br from-[#5FA800] to-green-700 p-4 relative overflow-hidden shadow-sm flex flex-col justify-center">
            <Laptop size={40} className="absolute -right-2 -bottom-2 text-white/20" />
            <h3 className="text-white font-bold text-lg leading-tight relative z-10">Electronics<br/>Mega Sale</h3>
            <span className="text-white/80 text-xs font-medium mt-1 relative z-10">Up to 40% OFF</span>
          </div>
          <div className="h-28 rounded-2xl bg-gradient-to-br from-[#F58300] to-orange-600 p-4 relative overflow-hidden shadow-sm flex flex-col justify-center">
            <Shirt size={40} className="absolute -right-2 -bottom-2 text-white/20" />
            <h3 className="text-white font-bold text-lg leading-tight relative z-10">Fashion<br/>Trending</h3>
            <span className="text-white/80 text-xs font-medium mt-1 relative z-10">New Arrivals</span>
          </div>
        </section>

        {/* All Categories Grid */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">All Categories</h2>
          <div className="grid grid-cols-3 gap-3">
            {allCategories.map((cat) => (
              <button 
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
                className={`bg-white p-3 rounded-xl shadow-sm flex flex-col items-center text-center gap-2 border-2 transition-all ${selectedCategory === cat.id ? 'border-[#5FA800]' : 'border-transparent hover:border-gray-100'}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${cat.color}`}>
                  <cat.icon size={20} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800 leading-tight mb-0.5">{cat.label}</h3>
                  <p className="text-[9px] text-gray-400">{cat.count}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

      </main>

      {/* Subcategory Slide-in Preview (Static for mockup) */}
      {selectedCategory === 'electronics' && (
        <div className="fixed bottom-[68px] left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-gray-100 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-30 animate-in slide-in-from-bottom-4 p-4 rounded-t-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900">Electronics</h3>
            <button onClick={() => setSelectedCategory(null)} className="text-xs text-gray-500 font-medium">Close</button>
          </div>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-2">
            {subCategories.map((sub, i) => (
              <button key={i} className="flex-shrink-0 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-full text-sm font-medium text-gray-700 transition-colors border border-gray-200">
                {sub}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-gray-100 flex items-center justify-between px-6 py-2 pb-5 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-[#5FA800] transition-colors">
          <HomeIcon size={24} strokeWidth={2} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-[#5FA800]">
          <LayoutGrid size={24} strokeWidth={2.5} />
          <span className="text-[10px] font-bold">Categories</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-[#5FA800] transition-colors relative">
          <ShoppingCart size={24} strokeWidth={2} />
          <span className="absolute top-1 right-1 bg-[#F58300] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">3</span>
          <span className="text-[10px] font-medium">Cart</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-[#5FA800] transition-colors">
          <Heart size={24} strokeWidth={2} />
          <span className="text-[10px] font-medium">Wishlist</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-[#5FA800] transition-colors">
          <User size={24} strokeWidth={2} />
          <span className="text-[10px] font-medium">Account</span>
        </button>
      </nav>
    </div>
  );
}
