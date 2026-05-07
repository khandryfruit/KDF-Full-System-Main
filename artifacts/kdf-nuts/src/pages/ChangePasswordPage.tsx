import React, { useState } from 'react';
import { ArrowLeft, Lock, Eye, EyeOff, Shield, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { BottomNav } from '../components/BottomNav';
import { useApp } from '../context/AppContext';

export function ChangePasswordPage() {
  const [, setLocation] = useLocation();
  const { token } = useApp();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const toggle = (k: keyof typeof show) => () => setShow(s => ({ ...s, [k]: !s[k] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('All fields are required'); return;
    }
    if (form.newPassword.length < 6) {
      setError('New password must be at least 6 characters'); return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match'); return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setSuccess(true);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setLocation('/account'), 1500);
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
        <h1 className="text-lg font-bold text-gray-900 flex-1">Change Password</h1>
      </div>

      <div className="flex flex-col items-center pt-8 pb-6 px-6">
        <div className="w-16 h-16 rounded-2xl bg-[#eef7e6] flex items-center justify-center mb-3 shadow-sm">
          <Shield className="w-8 h-8 text-[#5FA800]" />
        </div>
        <h2 className="font-bold text-gray-900 text-lg">Secure your account</h2>
        <p className="text-sm text-gray-500 text-center mt-1">Choose a strong password with at least 6 characters</p>
      </div>

      <form onSubmit={handleSubmit} className="px-4 space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <PasswordField label="Current Password" value={form.currentPassword}
            show={show.current} onToggle={toggle('current')}
            onChange={v => setForm(f => ({ ...f, currentPassword: v }))} />
          <PasswordField label="New Password" value={form.newPassword}
            show={show.new} onToggle={toggle('new')}
            onChange={v => setForm(f => ({ ...f, newPassword: v }))} />
          <PasswordField label="Confirm New Password" value={form.confirmPassword}
            show={show.confirm} onToggle={toggle('confirm')}
            onChange={v => setForm(f => ({ ...f, confirmPassword: v }))} last />
        </div>

        {/* Strength hints */}
        <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold mb-1">Password requirements:</p>
          <p className={form.newPassword.length >= 6 ? 'text-green-600' : ''}>• Minimum 6 characters</p>
          <p className={/[A-Z]/.test(form.newPassword) ? 'text-green-600' : ''}>• At least one uppercase letter (recommended)</p>
          <p className={/[0-9]/.test(form.newPassword) ? 'text-green-600' : ''}>• At least one number (recommended)</p>
        </div>

        {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        {success && <p className="text-green-700 text-sm text-center bg-green-50 rounded-xl px-4 py-3">✓ Password changed successfully!</p>}

        <button type="submit" disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-[#5FA800] text-white font-bold text-[15px] flex items-center justify-center gap-2 active:bg-[#4d8a00] transition-colors disabled:opacity-60 shadow-md">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
          {saving ? 'Changing…' : 'Change Password'}
        </button>
      </form>

      <BottomNav />
    </div>
  );
}

function PasswordField({ label, value, show, onToggle, onChange, last }: {
  label: string; value: string; show: boolean; onToggle: () => void; onChange: (v: string) => void; last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-1 py-2 ${last ? '' : 'border-b border-gray-50'}`}>
      <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
      </div>
      <button type="button" onClick={onToggle} className="p-1 rounded-full active:bg-gray-100">
        {show ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
      </button>
    </div>
  );
}
