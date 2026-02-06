import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru } from '../types';
import { useSekolah } from '../hooks/useSekolah';

interface LoginProps {
  onLoginSuccess: (user: Guru) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, showToast }) => {
  const sekolah = useSekolah(); // Use the custom hook
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('guru')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !data) {
        showToast('Username atau password salah', 'error');
        setLoading(false);
        return;
      }

      // Check role - Allow ADMIN, GURU, GURU_WALI, GURU_PENGAJAR
      if (['ADMIN', 'GURU', 'GURU_WALI', 'GURU_PENGAJAR'].includes(data.peran)) {
        showToast(`Login berhasil!`, 'success');
        
        // Activate redirect loading state
        setIsRedirecting(true);
        
        // Delay navigation to show spinner effect
        setTimeout(() => {
          onLoginSuccess(data);
        }, 1500);
      } else {
         showToast('Peran pengguna tidak dikenali.', 'error');
         setLoading(false);
      }

    } catch (err) {
      showToast('Terjadi kesalahan sistem', 'error');
      console.error(err);
      setLoading(false);
    }
  };

  // Full Screen Loading Spinner View
  if (isRedirecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900">
        <div className="relative">
          {/* Outer Ring */}
          <div className="w-16 h-16 rounded-full absolute border-4 border-solid border-gray-700"></div>
          {/* Inner Spinner */}
          <div className="w-16 h-16 rounded-full animate-spin absolute border-4 border-solid border-primary border-t-transparent shadow-md"></div>
        </div>
        <h2 className="mt-8 text-xl font-semibold text-white animate-pulse">
          Memuat Dashboard...
        </h2>
        <p className="text-gray-400 text-sm mt-2">Mohon tunggu sebentar</p>
      </div>
    );
  }

  // Login Form View
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md border border-gray-700">
        
        {/* School Identity Section */}
        <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
                {sekolah.logo_url ? (
                    <div className="w-24 h-24 bg-white/5 rounded-full p-2 flex items-center justify-center border border-gray-600 shadow-inner">
                        <img 
                            src={sekolah.logo_url} 
                            alt="Logo Sekolah" 
                            className="w-full h-full object-contain"
                        />
                    </div>
                ) : (
                    <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center text-4xl border border-gray-600">
                        🏫
                    </div>
                )}
            </div>
            <h2 className="text-2xl font-bold text-white leading-tight">
                {sekolah.nama || 'GurWal System'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">Sistem Informasi Guru Wali</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
            <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">👤</span>
                <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username Anda"
                className="pl-10 block w-full rounded-md bg-gray-700 border-gray-600 text-white placeholder-gray-500 border p-2.5 shadow-sm focus:border-primary focus:ring-primary transition-colors"
                />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">🔒</span>
                <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="pl-10 block w-full rounded-md bg-gray-700 border-gray-600 text-white placeholder-gray-500 border p-2.5 shadow-sm focus:border-primary focus:ring-primary transition-colors"
                />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-sm font-bold text-white bg-gradient-to-r from-primary to-secondary hover:from-indigo-500 hover:to-indigo-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 transition-all duration-200 transform hover:scale-[1.02]"
          >
            {loading ? 'Memverifikasi...' : 'Masuk ke Aplikasi'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-xs text-gray-500">
            &copy; {new Date().getFullYear()} {sekolah.nama || 'GurWal System'}. All rights reserved.
        </div>
      </div>
    </div>
  );
};