import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Added import
import { Layout } from './components/Layout';
import { Login } from './components/Login';
// Admin Components
import { AdminDashboard } from './components/AdminDashboard';
import { CrudGuru } from './components/CrudGuru';
import { CrudSiswa } from './components/CrudSiswa';
import { CrudKelas } from './components/CrudKelas';
import { CrudMapel } from './components/CrudMapel';
import { CrudKalender } from './components/CrudKalender'; // NEW IMPORT
import { CrudAnggotaGurwal } from './components/CrudAnggotaGurwal';
import { CrudDataPengajar } from './components/CrudDataPengajar';
import { CrudSekolah } from './components/CrudSekolah';
import { RekapKehadiranAdmin } from './components/RekapKehadiranAdmin';
import { InputKehadiranAdmin } from './components/InputKehadiranAdmin'; 

// Unified Guru Components
import { GuruDashboard } from './components/GuruDashboard';
// Binaan
import { DaftarBinaan } from './components/GuruBinaan/DaftarBinaan';
import { KehadiranBinaan } from './components/GuruBinaan/KehadiranBinaan';
import { ImportKehadiranTemplate } from './components/GuruBinaan/ImportKehadiranTemplate';
import { PelanggaranBinaan } from './components/GuruBinaan/PelanggaranBinaan';
import { PrestasiBinaan } from './components/GuruBinaan/PrestasiBinaan';
import { LaporanBinaan } from './components/GuruBinaan/LaporanBinaan';
// Pengajar
import { DaftarKelasAjar } from './components/GuruPengajar/DaftarKelasAjar';
import { InputNilai } from './components/GuruPengajar/InputNilai';
import { RekapNilai } from './components/GuruPengajar/RekapNilai';

import { Toast } from './components/Toast';
import { Guru, ViewState } from './types';

interface ToastState {
  message: string;
  type: 'success' | 'error';
  duration?: number;
  position?: 'top-right' | 'center';
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number; // Added for 24h cleanup logic
}

function App() {
  const [session, setSession] = useState<Guru | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    // Check localStorage for persisted session
    const storedUser = localStorage.getItem('gurwal_admin_user');
    const storedView = localStorage.getItem('gurwal_current_view') as ViewState;

    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setSession(user);
        
        if (storedView) {
          setCurrentView(storedView);
        } else {
          // Default views
          if (user.peran === 'ADMIN') setCurrentView('DASHBOARD');
          else setCurrentView('GURU_DASHBOARD');
        }
      } catch (e) {
        localStorage.removeItem('gurwal_admin_user');
        localStorage.removeItem('gurwal_current_view');
      }
    }
  }, []);

  // --- 24 HOUR CLEANUP LOGIC ---
  useEffect(() => {
    // Jalankan pengecekan setiap 1 menit
    const cleanupInterval = setInterval(() => {
        setNotifications(prevNotifications => {
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000); // 24 jam dalam milidetik
            // Filter notifikasi yang timestampnya lebih baru dari 24 jam yang lalu
            return prevNotifications.filter(n => n.timestamp > oneDayAgo);
        });
    }, 60000); 

    return () => clearInterval(cleanupInterval);
  }, []);

  // GLOBAL REALTIME ACTIVITY NOTIFICATION
  useEffect(() => {
    if (!session) return;

    // Listen to changes on key tables
    const tablesToWatch = ['kehadiran', 'pelanggaran', 'prestasi', 'nilai', 'siswa', 'guru'];
    
    const channel = supabase.channel('global_changes');

    tablesToWatch.forEach(table => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, (payload) => {
            handleRealtimeEvent(table, payload);
        });
    });

    channel.subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleRealtimeEvent = (table: string, payload: any) => {
      // Basic implementation: Create a generic message
      let action = '';
      let msg = '';
      
      if (payload.eventType === 'INSERT') action = 'Penambahan data';
      else if (payload.eventType === 'UPDATE') action = 'Pembaruan data';
      else if (payload.eventType === 'DELETE') action = 'Penghapusan data';

      msg = `${action} pada tabel ${table.toUpperCase()}.`;

      // UPDATED: Gunakan showToast agar muncul popup DAN masuk ke list notifikasi
      // Info tipe 'info' agar warnanya biru (neutral)
      showToast(msg, 'success'); 
  };

  const handleLoginSuccess = (user: Guru) => {
    setSession(user);
    localStorage.setItem('gurwal_admin_user', JSON.stringify(user));
    
    let defaultView: ViewState = 'DASHBOARD';
    if (user.peran !== 'ADMIN') defaultView = 'GURU_DASHBOARD';
    
    setCurrentView(defaultView);
    localStorage.setItem('gurwal_current_view', defaultView);
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('gurwal_admin_user');
    localStorage.removeItem('gurwal_current_view');
    showToast('Anda telah keluar', 'success');
    setNotifications([]);
  };

  const handleChangeView = (view: ViewState) => {
    setCurrentView(view);
    localStorage.setItem('gurwal_current_view', view);
  };

  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      const newNotif: NotificationItem = {
          id: Date.now().toString() + Math.random().toString(),
          title,
          message,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          read: false,
          type,
          timestamp: Date.now() // Simpan waktu pembuatan untuk cleanup logic
      };
      setNotifications(prev => [newNotif, ...prev].slice(0, 50)); // Limit 50 recent
  };

  const showToast = (
    message: string, 
    type: 'success' | 'error', 
    duration: number = 3000, 
    position: 'top-right' | 'center' = 'top-right'
  ) => {
    setToast({ message, type, duration, position });
    // Juga tambahkan ke lonceng notifikasi
    // Jika tipe success -> judul "Berhasil", error -> "Peringatan", else -> "Info"
    const title = type === 'success' ? 'Aktivitas Baru' : 'Peringatan';
    addNotification(title, message, type);
  };

  const handleClearNotifications = () => {
      setNotifications([]);
  };

  // Render Logic
  if (!session) {
    return (
      <>
        <Login onLoginSuccess={handleLoginSuccess} showToast={showToast} />
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            position={toast.position}
            onClose={() => setToast(null)}
          />
        )}
      </>
    );
  }

  const renderContent = () => {
    switch (currentView) {
      // ADMIN
      case 'GURU': return <CrudGuru showToast={showToast} />;
      case 'SISWA': return <CrudSiswa showToast={showToast} />;
      case 'KELAS': return <CrudKelas showToast={showToast} />;
      case 'MAPEL': return <CrudMapel showToast={showToast} />;
      case 'KALENDER_PENDIDIKAN': return <CrudKalender showToast={showToast} />; // NEW CASE
      case 'ANGGOTA_GURWAL': return <CrudAnggotaGurwal showToast={showToast} />;
      case 'DATA_PENGAJAR': return <CrudDataPengajar showToast={showToast} />;
      case 'PENGATURAN_SEKOLAH': return <CrudSekolah showToast={showToast} />;
      case 'INPUT_KEHADIRAN_ADMIN': return <InputKehadiranAdmin currentUser={session} showToast={showToast} />; 
      case 'REKAP_KEHADIRAN': return <RekapKehadiranAdmin showToast={showToast} />;
      case 'DASHBOARD': return <AdminDashboard />;
      
      // UNIFIED GURU
      case 'GURU_DASHBOARD': return <GuruDashboard currentUser={session} />;
      
      // BINAAN (WALI)
      case 'GURU_BINAAN_LIST': return <DaftarBinaan currentUser={session} showToast={showToast} />;
      case 'GURU_BINAAN_KEHADIRAN': return <KehadiranBinaan currentUser={session} showToast={showToast} />;
      case 'GURU_IMPORT_KEHADIRAN': return <ImportKehadiranTemplate currentUser={session} showToast={showToast} />;
      case 'GURU_BINAAN_PELANGGARAN': return <PelanggaranBinaan currentUser={session} showToast={showToast} />;
      case 'GURU_BINAAN_PRESTASI': return <PrestasiBinaan currentUser={session} showToast={showToast} />;
      case 'GURU_BINAAN_LAPORAN': return <LaporanBinaan currentUser={session} />;
      
      // PENGAJAR
      case 'GURU_PENGAJAR_JADWAL': return <DaftarKelasAjar currentUser={session} />;
      case 'GURU_PENGAJAR_NILAI': return <InputNilai currentUser={session} showToast={showToast} />;
      case 'GURU_PENGAJAR_REKAP': return <RekapNilai currentUser={session} />;
        
      default:
        return <div className="p-6 text-white">Halaman tidak ditemukan</div>;
    }
  };

  return (
    <Layout
      currentUser={session}
      currentView={currentView}
      onChangeView={handleChangeView}
      onLogout={handleLogout}
      notifications={notifications}
      onClearNotifications={handleClearNotifications}
    >
      {renderContent()}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          position={toast.position}
          onClose={() => setToast(null)}
        />
      )}
    </Layout>
  );
}

export default App;