import React, { useState } from 'react';
import { ArrowLeft, MapPin, Plus, Trash2, Check, Edit2, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { BottomNav } from '../components/BottomNav';
import { useApp } from '../context/AppContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Address {
  id: number;
  userId: number;
  label: string;
  name: string;
  phone: string;
  address: string;
  area?: string;
  city: string;
  postalCode?: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
}

const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala', 'Other'];
const LABELS = ['Home', 'Work', 'Other'];

const emptyForm = { label: 'Home', name: '', phone: '', address: '', area: '', city: '', postalCode: '' };

export function AddressesPage() {
  const [, setLocation] = useLocation();
  const { token, isAuthenticated } = useApp();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const { data: addresses = [], isLoading } = useQuery<Address[]>({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await fetch('/api/addresses', { headers });
      if (!res.ok) throw new Error('Failed to load addresses');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await fetch('/api/addresses', { method: 'POST', headers, body: JSON.stringify({ ...data, isDefault: addresses.length === 0 }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['addresses'] }); closeForm(); },
    onError: (e: any) => setFormError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const res = await fetch(`/api/addresses/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['addresses'] }); closeForm(); },
    onError: (e: any) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/addresses/${id}`, { method: 'DELETE', headers });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });

  const defaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/addresses/${id}/default`, { method: 'PATCH', headers });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });

  const closeForm = () => { setShowForm(false); setEditId(null); setForm({ ...emptyForm }); setFormError(''); };

  const handleEdit = (a: Address) => {
    setForm({ label: a.label, name: a.name, phone: a.phone, address: a.address, area: a.area ?? '', city: a.city, postalCode: a.postalCode ?? '' });
    setEditId(a.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.address || !form.city) { setFormError('Name, phone, address, and city are required'); return; }
    setFormError('');
    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans">
        <div className="bg-white sticky top-0 z-20 px-4 py-4 border-b border-gray-100 flex items-center gap-3">
          <button onClick={() => setLocation('/account')} className="p-2 -ml-2 rounded-full active:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Addresses</h1>
        </div>
        <div className="text-center py-20 px-6">
          <MapPin className="w-14 h-14 text-gray-200 mx-auto mb-4" />
          <p className="font-semibold text-gray-700 mb-1">Login to manage addresses</p>
          <p className="text-sm text-gray-400 mb-5">Save delivery addresses for faster checkout</p>
          <button onClick={() => setLocation('/login')} className="bg-[#5FA800] text-white font-bold px-6 py-3 rounded-xl text-sm">
            Login / Sign Up
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F8F9FB] pb-20 font-sans">
      <div className="bg-white sticky top-0 z-20 px-4 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => setLocation('/account')} className="p-2 -ml-2 rounded-full active:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-800" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Saved Addresses</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ ...emptyForm }); }}
          className="flex items-center gap-1.5 text-[#5FA800] text-sm font-semibold active:opacity-70 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="p-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#5FA800]" />
          </div>
        )}

        {!isLoading && addresses.length === 0 && !showForm && (
          <div className="text-center py-16">
            <MapPin className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="font-semibold text-gray-700 mb-1">No addresses saved</p>
            <p className="text-sm text-gray-400 mb-5">Add a delivery address to get started</p>
            <button onClick={() => setShowForm(true)} className="bg-[#5FA800] text-white font-bold px-6 py-3 rounded-xl text-sm">
              Add Address
            </button>
          </div>
        )}

        {addresses.map(a => (
          <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#5FA800]/10 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-[#5FA800]" />
                </div>
                <span className="font-bold text-gray-900 text-sm">{a.label}</span>
                {a.isDefault && (
                  <span className="text-[10px] font-bold bg-[#5FA800]/10 text-[#5FA800] px-2 py-0.5 rounded-full">Default</span>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 active:bg-gray-100">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteMutation.mutate(a.id)} disabled={deleteMutation.isPending}
                  className="p-1.5 rounded-lg text-red-300 hover:text-red-500 active:bg-red-50 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-sm font-medium text-gray-800">{a.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{a.phone}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {a.address}{a.area ? `, ${a.area}` : ''}{a.city ? `, ${a.city}` : ''}
            </p>
            {!a.isDefault && (
              <button
                onClick={() => defaultMutation.mutate(a.id)}
                disabled={defaultMutation.isPending}
                className="mt-3 flex items-center gap-1.5 text-xs text-[#5FA800] font-semibold active:opacity-70 transition-opacity disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> Set as default
              </button>
            )}
          </div>
        ))}

        {/* Add / Edit Form */}
        {showForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#5FA800]/30">
            <h3 className="font-bold text-gray-900 mb-4">{editId ? 'Edit Address' : 'Add New Address'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                {LABELS.map(l => (
                  <button type="button" key={l} onClick={() => setForm(f => ({ ...f, label: l }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${form.label === l ? 'bg-[#5FA800] text-white border-[#5FA800]' : 'border-gray-200 text-gray-600'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full Name *" className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#5FA800]/50" />
              <input required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Phone Number *" className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#5FA800]/50" />
              <input required value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Street Address *" className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#5FA800]/50" />
              <input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                placeholder="Area / Locality (optional)" className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#5FA800]/50" />
              <select required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#5FA800]/50 bg-white text-gray-700">
                <option value="">Select City *</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))}
                placeholder="Postal Code (optional)" className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#5FA800]/50" />
              {formError && <p className="text-red-500 text-xs">{formError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeForm}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={isMutating}
                  className="flex-1 py-3 rounded-xl bg-[#5FA800] text-white font-bold text-sm active:bg-[#4d8a00] disabled:opacity-60 flex items-center justify-center gap-2">
                  {isMutating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editId ? 'Save Changes' : 'Add Address'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
