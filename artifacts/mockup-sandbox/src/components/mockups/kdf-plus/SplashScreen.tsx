import React, { useEffect, useState } from 'react';
import kdfLogo from '../../../assets/kdf-logo.png';
import './_group.css';

export function SplashScreen() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-screen min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden" style={{ backgroundColor: '#0D2B00' }}>
      {/* Background decoration */}
      <div className="absolute top-1/4 left-0 w-64 h-64 bg-[#5FA800] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-[#5FA800] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="z-10 flex flex-col items-center">
        <div className="w-28 h-28 rounded-3xl overflow-hidden mb-6 shadow-2xl shadow-black/40 ring-1 ring-white/10">
          <img src={kdfLogo} alt="KDF Nuts" className="w-full h-full object-cover" />
        </div>

        <h1 className="text-5xl font-extrabold text-white tracking-tight mb-3">
          KDF <span style={{ color: '#5FA800' }}>NUTS</span>
        </h1>

        <p className="text-[#a4c982] text-lg font-medium tracking-wide">
          Smart Shopping. Better Life.
        </p>
      </div>

      <div className="absolute bottom-16 flex flex-col items-center">
        <div className="flex gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-[#5FA800] animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-[#5FA800] animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-[#5FA800] animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
        <p className="text-white/50 text-sm font-medium">Loading Experience{dots}</p>
      </div>
    </div>
  );
}
