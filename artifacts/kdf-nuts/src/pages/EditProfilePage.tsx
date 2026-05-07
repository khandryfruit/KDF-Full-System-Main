import React, { useState } from 'react';
import { ArrowLeft, Camera, User, Phone, Mail, MapPin, Calendar, Save, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { BottomNav } from '../components/BottomNav';
import { useApp } from '../context/AppContext';

const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala', 'Other'];

export function EditProfilePage() {
  const [, setLocation] = useLocation();
  const { user, token, setAuth } = useApp();

  const [form, setForm] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    city: (user as any)?.city ?? '',
    country: (user as any)?.country ?? 'Pakistan',
    address: (user as any)?.address ?? '',
    postalCode: (user as any)?.postalCode ?? '',
    gender: (user as any)?.gender ?? '',
    dateOfBirth: (user as any)?.dateOfBirth ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      setAuth(token!, { ...user!, ...data });
      setSuccess(true);
      setTimeout(() => setLocation('/account'), 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-24 font-sans">
      <div className="bg-white sticky top-0 z-20 px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => setLocation('/account')} className="p-2 -ml-2 rounded-full active:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-800" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Edit Profile</h1>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center pt-6 pb-4 bg-white mb-3 border-b border-gray-100">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5FA800] to-[#4d8a00] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
            {(user as any)?.profileImage
              ? <img src={(user as any).profileImage} className="w-full h-full rounded-full object-cover" />
              : (form.name ? form.name.charAt(0).toUpperCase() : 'U')}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#5FA800] flex items-center justify-center shadow-md">
            <Camera className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Tap to change photo</p>
      </div>

      <form onSubmit={handleSubmit} className="px-4 space-y-3">
        {/* Personal Info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Personal Information</h2>
          <Field icon={<User className="w-4 h-4 text-gray-400" />} label="Full Name" required>
            <input value={form.name} onChange={set('name')} placeholder="Your full name"
              className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
          </Field>
          <Field icon={<Phone className="w-4 h-4 text-gray-400" />} label="Phone Number">
            <input value={form.phone} onChange={set('phone')} placeholder="+92 300 0000000"
              className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
          </Field>
          <Field icon={<Mail className="w-4 h-4 text-gray-400" />} label="Email">
            <input type="email" value={form.email} onChange={set('email')} placeholder="email@example.com"
              className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
          </Field>
          <Field icon={<Calendar className="w-4 h-4 text-gray-400" />} label="Date of Birth">
            <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')}
              className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
          </Field>
          <div className="flex items-center gap-3 px-1 py-2 border-b border-gray-50">
            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-0.5">Gender</p>
              <select value={form.gender} onChange={set('gender')}
                className="w-full text-sm text-gray-900 bg-transparent outline-none">
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Location</h2>
          <Field icon={<MapPin className="w-4 h-4 text-gray-400" />} label="Street Address">
            <input value={form.address} onChange={set('address')} placeholder="Street address"
              className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
          </Field>
          <div className="flex items-center gap-3 px-1 py-2 border-b border-gray-50">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-0.5">City</p>
              <select value={form.city} onChange={set('city')}
                className="w-full text-sm text-gray-900 bg-transparent outline-none">
                <option value="">Select city</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <Field icon={<MapPin className="w-4 h-4 text-gray-400" />} label="Postal Code">
            <input value={form.postalCode} onChange={set('postalCode')} placeholder="54000"
              className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
          </Field>
        </div>

        {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        {success && <p className="text-green-700 text-sm text-center bg-green-50 rounded-xl px-4 py-3">✓ Profile updated!</p>}

        <button type="submit" disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-[#5FA800] text-white font-bold text-[15px] flex items-center justify-center gap-2 active:bg-[#4d8a00] transition-colors disabled:opacity-60 shadow-md">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      <BottomNav />
    </div>
  );
}

function Field({ icon, label, required, children }: { icon: React.ReactNode; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2 border-b border-gray-50">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <p className="text-[10px] text-gray-400 mb-0.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</p>
        {children}
      </div>
    </div>
  );
}
