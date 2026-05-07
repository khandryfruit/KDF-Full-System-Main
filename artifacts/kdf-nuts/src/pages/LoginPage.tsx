import React, { useState } from 'react';
import { Eye, EyeOff, Facebook, Mail, Lock, User, ChevronRight, ChevronDown, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useApp } from '../context/AppContext';
import { useLogin, useRegister } from '@workspace/api-client-react';

export function LoginPage() {
  const [, setLocation] = useLocation();
  const { setAuth } = useApp();
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');

  // Login states
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup states
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 1 fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2 fields
  const [country, setCountry] = useState('Pakistan');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const step1Valid = fullName.trim() !== '' && phone.trim() !== '' && password.trim() !== '' && !passwordMismatch;
  const step2Valid = country.trim() !== '' && city.trim() !== '' && address.trim() !== '';

  const cities = [
    "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Peshawar",
    "Quetta", "Multan", "Gujranwala", "Sialkot", "Hyderabad", "Abbottabad",
    "Bahawalpur", "Sargodha", "Sukkur", "Larkana", "Sheikhupura", "Rahim Yar Khan",
    "Jhang", "Gujrat", "Mardan", "Mingora", "Nawabshah", "Mirpur", "Muzaffarabad"
  ];

  const countries = ["Pakistan", "UK", "USA", "UAE", "Saudi Arabia", "Australia", "Canada"];

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuth(data.token, data.user as any);
        setLocation('/home');
      },
      onError: (err: any) => {
        setError(err?.data?.message || 'Invalid phone or password');
      },
    },
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        setAuth(data.token, data.user as any);
        setLocation('/home');
      },
      onError: (err: any) => {
        setError(err?.data?.message || 'Registration failed. Try again.');
      },
    },
  });

  const handleLogin = () => {
    setError('');
    loginMutation.mutate({ data: { phone: loginPhone, password: loginPassword } });
  };

  const handleGuest = () => setLocation('/home');

  const handleCreateAccount = () => {
    setError('');
    registerMutation.mutate({
      data: {
        name: fullName,
        phone,
        email: email || undefined,
        password,
        city,
        country,
        address,
      },
    });
  };

  return (
    <div className="w-full max-w-[430px] mx-auto h-screen min-h-[100dvh] bg-[#F8F9FB] flex flex-col font-sans relative overflow-hidden">

      {/* Header Area */}
      <div className="pt-10 pb-0 px-6 bg-white shadow-sm rounded-b-3xl z-20 shrink-0 relative">
        <button
          onClick={() => setLocation('/home')}
          className="absolute top-4 left-4 p-2 rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="flex items-center justify-center gap-2 mb-8 mt-6">
          <img src={import.meta.env.BASE_URL + "kdf-logo.png"} alt="KDF NUTS" className="h-10 w-auto object-contain" />
          <span className="text-2xl font-extrabold text-gray-900">
            KDF <span style={{ color: '#5FA800' }}>NUTS</span>
          </span>
        </div>

        {/* Tabs */}
        <div className="flex relative mt-4">
          <button
            onClick={() => { setActiveTab('login'); setSignupStep(1); setError(''); }}
            className={`flex-1 pb-4 text-center font-bold text-lg transition-colors ${activeTab === 'login' ? 'text-[#5FA800]' : 'text-gray-400'}`}
          >
            Login
          </button>
          <button
            onClick={() => { setActiveTab('signup'); setError(''); }}
            className={`flex-1 pb-4 text-center font-bold text-lg transition-colors ${activeTab === 'signup' ? 'text-[#5FA800]' : 'text-gray-400'}`}
          >
            Sign Up
          </button>
          <div
            className="absolute bottom-0 h-1 bg-[#5FA800] rounded-t-full transition-all duration-300 ease-out"
            style={{ width: '50%', left: activeTab === 'login' ? '0%' : '50%' }}
          ></div>
          <div className="absolute bottom-0 h-px w-full bg-gray-200 -z-10"></div>
        </div>
      </div>

      {/* Form Area */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto relative z-10 w-full">

        {/* Login Tab */}
        <div className={`absolute top-0 left-0 w-full p-6 transition-all duration-500 ease-in-out ${activeTab === 'login' ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}>
          {error && activeTab === 'login' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">{error}</div>
          )}
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
              <div className="relative flex items-center h-14 bg-white rounded-xl border border-gray-200 focus-within:border-[#5FA800] focus-within:ring-2 focus-within:ring-[#5FA800]/20 transition-all overflow-hidden shadow-sm">
                <div className="pl-4 pr-3 flex items-center border-r border-gray-100 h-full bg-gray-50">
                  <span className="text-sm font-bold text-gray-700 mr-2">PK</span>
                  <span className="text-sm font-medium text-gray-600">+92</span>
                </div>
                <input
                  type="text"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="03001234567"
                  className="w-full h-full px-4 outline-none text-gray-800 placeholder-gray-400 bg-transparent font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
              <div className="relative flex items-center h-14 bg-white rounded-xl border border-gray-200 focus-within:border-[#5FA800] focus-within:ring-2 focus-within:ring-[#5FA800]/20 transition-all shadow-sm">
                <div className="pl-4"><Lock className="w-5 h-5 text-gray-400" /></div>
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full h-full px-3 outline-none text-gray-800 placeholder-gray-400 bg-transparent font-medium"
                />
                <button onClick={() => setShowLoginPassword(!showLoginPassword)} className="pr-4 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors">
                  {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex justify-end mt-3">
                <button className="text-sm font-bold hover:opacity-80 transition-opacity" style={{ color: '#5FA800' }}>Forgot Password?</button>
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={loginMutation.isPending}
              className="w-full h-14 mt-6 rounded-xl text-white font-bold text-lg transition-transform active:scale-[0.98] shadow-lg shadow-[#5FA800]/30 disabled:opacity-60"
              style={{ backgroundColor: '#5FA800' }}
            >
              {loginMutation.isPending ? 'Logging in...' : 'Login'}
            </button>
          </div>

          {/* Social Login */}
          <div className="mt-8">
            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="flex-shrink-0 mx-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Or continue with</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <button className="flex items-center justify-center gap-2 h-14 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm active:scale-[0.98]">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="font-semibold text-gray-700">Google</span>
              </button>
              <button className="flex items-center justify-center gap-2 h-14 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm active:scale-[0.98]">
                <Facebook className="w-5 h-5 text-[#1877F2]" fill="#1877F2" strokeWidth={0} />
                <span className="font-semibold text-gray-700">Facebook</span>
              </button>
            </div>
          </div>

          <div className="mt-8 text-center pb-8">
            <button onClick={handleGuest} className="text-gray-500 font-bold hover:text-gray-800 transition-colors flex items-center justify-center gap-1 mx-auto text-sm">
              Continue as Guest
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Signup Tab */}
        <div className={`absolute top-0 left-0 w-full transition-all duration-500 ease-in-out ${activeTab === 'signup' ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>

          <div className="px-6 py-6 border-b border-gray-100 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center justify-between max-w-[280px] mx-auto relative">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2 rounded-full"></div>
              <div
                className="absolute top-1/2 left-0 h-0.5 bg-[#5FA800] -z-10 -translate-y-1/2 transition-all duration-500 rounded-full"
                style={{ width: signupStep === 1 ? '0%' : '100%' }}
              ></div>

              <div className="flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors duration-300 ${signupStep >= 1 ? 'bg-[#5FA800] text-white shadow-md shadow-[#5FA800]/20' : 'bg-gray-100 text-gray-400'}`}>1</div>
                <span className={`text-xs font-bold transition-colors ${signupStep >= 1 ? 'text-[#5FA800]' : 'text-gray-400'}`}>Account Info</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-2 ${signupStep === 2 ? 'bg-[#5FA800] border-[#5FA800] text-white shadow-md shadow-[#5FA800]/20' : 'bg-white border-gray-300 text-gray-400'}`}>2</div>
                <span className={`text-xs font-bold transition-colors ${signupStep === 2 ? 'text-[#5FA800]' : 'text-gray-400'}`}>Your Address</span>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden min-h-[500px]">
            {/* Step 1 */}
            <div className={`absolute top-0 left-0 w-full p-6 transition-all duration-500 ease-in-out ${signupStep === 1 ? 'translate-x-0 opacity-100 relative' : '-translate-x-full opacity-0 absolute pointer-events-none'}`}>
              {error && activeTab === 'signup' && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">{error}</div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Full Name</label>
                  <div className="relative flex items-center h-14 bg-white rounded-xl border border-gray-200 focus-within:border-[#5FA800] focus-within:ring-2 focus-within:ring-[#5FA800]/20 transition-all shadow-sm">
                    <div className="pl-4"><User className="w-5 h-5 text-gray-400" /></div>
                    <input type="text" placeholder="Ali Hassan" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full h-full px-3 outline-none text-gray-800 bg-transparent font-medium" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Phone Number</label>
                  <div className="relative flex items-center h-14 bg-white rounded-xl border border-gray-200 focus-within:border-[#5FA800] focus-within:ring-2 focus-within:ring-[#5FA800]/20 transition-all overflow-hidden shadow-sm">
                    <div className="pl-4 pr-3 flex items-center border-r border-gray-100 h-full bg-gray-50">
                      <span className="text-sm font-bold text-gray-700 mr-2">PK</span>
                      <span className="text-sm font-medium text-gray-600">+92</span>
                    </div>
                    <input type="tel" placeholder="03001234567" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-full px-4 outline-none text-gray-800 bg-transparent font-medium" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Email Address <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <div className="relative flex items-center h-14 bg-white rounded-xl border border-gray-200 focus-within:border-[#5FA800] focus-within:ring-2 focus-within:ring-[#5FA800]/20 transition-all shadow-sm">
                    <div className="pl-4"><Mail className="w-5 h-5 text-gray-400" /></div>
                    <input type="email" placeholder="ali@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-full px-3 outline-none text-gray-800 bg-transparent font-medium" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
                  <div className="relative flex items-center h-14 bg-white rounded-xl border border-gray-200 focus-within:border-[#5FA800] focus-within:ring-2 focus-within:ring-[#5FA800]/20 transition-all shadow-sm">
                    <div className="pl-4"><Lock className="w-5 h-5 text-gray-400" /></div>
                    <input type={showSignupPassword ? 'text' : 'password'} placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-full px-3 outline-none text-gray-800 bg-transparent font-medium" />
                    <button onClick={() => setShowSignupPassword(!showSignupPassword)} className="pr-4 text-gray-400 hover:text-gray-600 transition-colors">
                      {showSignupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Confirm Password</label>
                  <div className={`relative flex items-center h-14 bg-white rounded-xl border ${passwordMismatch ? 'border-red-400' : 'border-gray-200 focus-within:border-[#5FA800]'} focus-within:ring-2 focus-within:ring-[#5FA800]/20 transition-all shadow-sm`}>
                    <div className="pl-4"><Lock className={`w-5 h-5 ${passwordMismatch ? 'text-red-400' : 'text-gray-400'}`} /></div>
                    <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Repeat password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full h-full px-3 outline-none text-gray-800 bg-transparent font-medium" />
                    <button onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="pr-4 text-gray-400 hover:text-gray-600 transition-colors">
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordMismatch && <p className="text-red-500 text-sm font-medium mt-1.5 px-1">Passwords do not match</p>}
                </div>

                <div className="pt-4 pb-8">
                  <button
                    onClick={() => setSignupStep(2)}
                    disabled={!step1Valid}
                    className={`w-full h-14 flex items-center justify-center gap-2 rounded-xl text-white font-bold text-lg transition-all ${step1Valid ? 'bg-[#5FA800] active:scale-[0.98] shadow-lg shadow-[#5FA800]/30' : 'bg-gray-300 cursor-not-allowed'}`}
                  >
                    Next: Add Address <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className={`absolute top-0 left-0 w-full transition-all duration-500 ease-in-out ${signupStep === 2 ? 'translate-x-0 opacity-100 relative' : 'translate-x-full opacity-0 absolute pointer-events-none'}`}>
              <div className="p-6 pb-32 space-y-5">
                <h3 className="text-xl font-extrabold text-gray-900 mb-2 tracking-tight">Almost there{fullName ? `, ${fullName.split(' ')[0]}` : ''}!</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Country</label>
                    <div className="relative">
                      <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full h-14 pl-4 pr-10 bg-white rounded-xl border border-gray-200 outline-none text-gray-800 focus:border-[#5FA800] appearance-none font-medium shadow-sm">
                        {countries.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">City</label>
                    <div className="relative">
                      <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full h-14 pl-4 pr-10 bg-white rounded-xl border border-gray-200 outline-none text-gray-800 focus:border-[#5FA800] appearance-none font-medium shadow-sm">
                        <option value="" disabled>Select city</option>
                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Area / Street Address</label>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House #, Street, Area" className="w-full h-24 p-4 bg-white rounded-xl border border-gray-200 outline-none text-gray-800 focus:border-[#5FA800] resize-none font-medium shadow-sm" />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Postal Code <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="54000" className="w-full h-14 px-4 bg-white rounded-xl border border-gray-200 outline-none text-gray-800 focus:border-[#5FA800] font-medium shadow-sm" />
                </div>
              </div>

              <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-100 p-4 pb-6 flex items-center gap-3 z-30">
                <button onClick={() => setSignupStep(1)} className="h-14 px-5 flex items-center justify-center rounded-xl font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors shrink-0">
                  <ArrowLeft className="w-5 h-5 mr-1" /> Back
                </button>
                <button
                  onClick={handleCreateAccount}
                  disabled={!step2Valid || registerMutation.isPending}
                  className={`flex-1 h-14 flex items-center justify-center rounded-xl text-white font-bold text-lg transition-all ${step2Valid && !registerMutation.isPending ? 'bg-[#5FA800] active:scale-[0.98] shadow-lg shadow-[#5FA800]/30' : 'bg-gray-300 cursor-not-allowed opacity-50'}`}
                >
                  {registerMutation.isPending ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
