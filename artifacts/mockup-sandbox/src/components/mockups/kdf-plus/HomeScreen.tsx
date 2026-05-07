import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Bell, 
  Laptop, 
  Shirt, 
  Home as HomeIcon, 
  Sparkles, 
  Dumbbell, 
  ShoppingBag, 
  Gift, 
  BookOpen,
  Heart,
  Star,
  LayoutGrid,
  User,
  ChevronRight,
  Flame,
  Clock
} from 'lucide-react';
import './_group.css';

const PRIMARY_COLOR = '#5FA800';
const ACCENT_COLOR = '#F58300';
const BG_COLOR = '#F8F9FB';

export function HomeScreen() {
  const [timeLeft, setTimeLeft] = useState(2 * 3600 + 15 * 60 + 38);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const categories = [
    { icon: Laptop, label: 'Electronics', color: 'bg-green-100 text-[#5FA800]' },
    { icon: Shirt, label: 'Fashion', color: 'bg-orange-100 text-[#F58300]' },
    { icon: HomeIcon, label: 'Home', color: 'bg-emerald-100 text-emerald-600' },
    { icon: Sparkles, label: 'Beauty', color: 'bg-amber-100 text-amber-600' },
    { icon: Dumbbell, label: 'Sports', color: 'bg-[#5FA800]/10 text-[#5FA800]' },
    { icon: ShoppingBag, label: 'Groceries', color: 'bg-[#F58300]/10 text-[#F58300]' },
    { icon: Gift, label: 'Toys', color: 'bg-green-100 text-green-700' },
    { icon: BookOpen, label: 'Books', color: 'bg-yellow-100 text-yellow-700' },
  ];

  const products = [
    { id: 1, title: 'Wireless Noise-Cancelling Headphones Pro', price: 1299, oldPrice: 2500, discount: 48, rating: 4.8, reviews: 124, gradient: 'from-green-400 to-emerald-600' },
    { id: 2, title: 'Men\'s Casual Cotton Blend T-Shirt', price: 899, oldPrice: 1500, discount: 40, rating: 4.5, reviews: 89, gradient: 'from-orange-400 to-amber-500' },
    { id: 3, title: 'Smart Fitness Watch Series 7', price: 3499, oldPrice: 5000, discount: 30, rating: 4.9, reviews: 312, gradient: 'from-emerald-400 to-teal-500' },
    { id: 4, title: 'Organic Skincare Serum 30ml', price: 1599, oldPrice: 2000, discount: 20, rating: 4.6, reviews: 56, gradient: 'from-yellow-400 to-orange-500' },
    { id: 5, title: 'Premium Leather Wallet', price: 1199, oldPrice: 1800, discount: 33, rating: 4.7, reviews: 201, gradient: 'from-green-500 to-[#5FA800]' },
  ];

  const ProductCard = ({ product }: { product: any }) => (
    <div className="w-[160px] flex-shrink-0 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col relative group">
      {/* Discount Badge */}
      <div className="absolute top-2 left-2 z-10 bg-[#F58300] text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
        {product.discount}% OFF
      </div>
      
      {/* Wishlist Button */}
      <button className="absolute top-2 right-2 z-10 p-1.5 bg-white/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-red-500 hover:bg-white transition-colors">
        <Heart size={16} strokeWidth={2.5} />
      </button>

      {/* Image Placeholder */}
      <div className={`h-[160px] w-full bg-gradient-to-br ${product.gradient} relative overflow-hidden flex items-center justify-center`}>
        <div className="absolute inset-0 bg-black/5"></div>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-grow">
        <h3 className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight mb-1">{product.title}</h3>
        
        <div className="flex items-center gap-1 mb-2">
          <Star size={12} className="fill-[#F58300] text-[#F58300]" />
          <span className="text-xs font-semibold text-gray-700">{product.rating}</span>
          <span className="text-[10px] text-gray-400">({product.reviews})</span>
        </div>

        <div className="mt-auto">
          <div className="flex items-end gap-1.5 mb-2">
            <span className="text-lg font-bold text-[#5FA800] leading-none">₨{product.price.toLocaleString()}</span>
            <span className="text-[11px] text-gray-400 line-through leading-none pb-0.5">₨{product.oldPrice.toLocaleString()}</span>
          </div>
          
          <button className="w-full py-[7px] px-3 bg-gradient-to-b from-[#6BC500] to-[#5FA800] text-white text-[11px] font-bold rounded-lg shadow-[0_2px_8px_rgba(95,168,0,0.28)] active:scale-[0.96] active:shadow-none transition-all duration-150 flex items-center justify-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-[100dvh] pb-20 relative font-sans" style={{ backgroundColor: BG_COLOR }}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-sm px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#5FA800] flex items-center justify-center text-white font-bold text-lg">
              K
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">KDF <span className="text-[#5FA800]">Plus</span></span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors relative">
              <Bell size={22} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors relative">
              <ShoppingCart size={22} />
              <span className="absolute top-0 right-0 bg-[#F58300] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">3</span>
            </button>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input 
            type="text" 
            placeholder="Search products, brands and more..." 
            className="w-full bg-gray-100 text-sm rounded-full py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-[#5FA800]/20 transition-all"
          />
        </div>
      </header>

      {/* Main Content Scrollable */}
      <main className="flex flex-col gap-6 pt-4 overflow-x-hidden">
        
        {/* Hero Slider */}
        <section className="px-4">
          <div className="w-full h-[180px] rounded-2xl overflow-hidden relative shadow-md bg-white">
            <div className="flex w-[300%] h-full animate-slider">
              {/* Slide 1 - Deep Green */}
              <div className="w-1/3 h-full relative bg-gradient-to-br from-[#2c4c00] to-[#5FA800]">
                <div className="absolute inset-0 flex flex-col justify-center px-6">
                  <span className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">New Collection</span>
                  <h2 className="text-2xl font-bold text-white leading-tight mb-3">Fresh<br/>Arrivals</h2>
                  <button className="bg-white text-[#5FA800] text-xs font-bold px-4 py-2 rounded-full w-max shadow-lg hover:bg-gray-50">
                    Shop Now
                  </button>
                </div>
              </div>
              {/* Slide 2 - Orange */}
              <div className="w-1/3 h-full relative bg-gradient-to-br from-[#F58300] to-[#ff9f33]">
                <div className="absolute inset-0 flex flex-col justify-center px-6">
                  <span className="text-white/90 text-xs font-bold uppercase tracking-wider mb-1">Limited Time</span>
                  <h2 className="text-2xl font-bold text-white leading-tight mb-3">Flash Sale<br/>50% OFF</h2>
                  <button className="bg-white text-[#F58300] text-xs font-bold px-4 py-2 rounded-full w-max shadow-lg">
                    View Deals
                  </button>
                </div>
              </div>
              {/* Slide 3 - Dark Green/Black */}
              <div className="w-1/3 h-full relative bg-gradient-to-br from-[#1a2d00] to-black">
                <div className="absolute inset-0 flex flex-col justify-center px-6">
                  <span className="text-white/90 text-xs font-bold uppercase tracking-wider mb-1">Members Only</span>
                  <h2 className="text-2xl font-bold text-white leading-tight mb-3">Exclusive<br/>Rewards</h2>
                  <button className="bg-[#5FA800] text-white text-xs font-bold px-4 py-2 rounded-full w-max shadow-lg">
                    Claim Now
                  </button>
                </div>
              </div>
            </div>
            
            {/* Dots */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
              <div className="w-4 h-1.5 rounded-full bg-white"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-white/50"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-white/50"></div>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="px-4">
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 pt-1 -mx-4 px-4 snap-x">
            {categories.map((cat, i) => (
              <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0 snap-start">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${cat.color} shadow-sm`}>
                  <cat.icon size={24} strokeWidth={2} />
                </div>
                <span className="text-xs font-medium text-gray-700">{cat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Flash Deals */}
        <section className="px-4">
          <div className="flex items-end justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1">
                Flash Deals <Flame size={20} className="text-[#F58300] fill-[#F58300]" />
              </h2>
              <div className="flex items-center gap-1 bg-[#F58300]/10 px-2 py-1 rounded-md border border-[#F58300]/20">
                <Clock size={12} className="text-[#F58300]" />
                <span className="text-xs font-bold text-[#F58300] tracking-wider">{formatTime(timeLeft)}</span>
              </div>
            </div>
            <button className="text-xs font-bold text-[#5FA800] flex items-center">
              See All <ChevronRight size={14} />
            </button>
          </div>
          
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4 snap-x">
            {products.slice(0, 3).map(product => (
              <div key={product.id} className="snap-start">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </section>

        {/* Top Picks */}
        <section className="px-4">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Top Picks for You</h2>
          </div>
          
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4 snap-x">
            {products.slice(2, 5).map(product => (
              <div key={product.id} className="snap-start">
                <ProductCard product={product} />
              </div>
            ))}
            {products.slice(0, 1).map(product => (
              <div key={product.id} className="snap-start">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </section>

        {/* Trending Now */}
        <section className="px-4 mb-4">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Trending Now</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {products.slice(0, 4).map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-gray-100 flex items-center justify-between px-6 py-2 pb-5 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button className="flex flex-col items-center gap-1 p-2 text-[#5FA800]">
          <HomeIcon size={24} strokeWidth={2.5} />
          <span className="text-[10px] font-bold">Home</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-gray-400 hover:text-[#5FA800] transition-colors">
          <LayoutGrid size={24} strokeWidth={2} />
          <span className="text-[10px] font-medium">Categories</span>
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
