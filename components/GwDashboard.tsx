import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru } from '../types';

interface GwDashboardProps {
  currentUser: Guru;
}

export const GwDashboard: React.FC<GwDashboardProps> = ({ currentUser }) => {
  const [stats, setStats] = useState({
    siswaBinaan: 0,
    hadirHariIni: 0,
    pelanggaran: 0,
    prestasi: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Total Siswa Binaan
        const { count: siswaCount } = await supabase
          .from('bimbingan')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id);

        // 2. Kehadiran Hari Ini (HADIR)
        const { count: hadirCount } = await supabase
          .from('kehadiran')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id)
          .eq('tanggal', today)
          .eq('status', 'HADIR');

        // 3. Total Pelanggaran
        const { count: pelCount } = await supabase
          .from('pelanggaran')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id);

        // 4. Total Prestasi
        const { count: presCount } = await supabase
          .from('prestasi')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id);

        setStats({
          siswaBinaan: siswaCount || 0,
          hadirHariIni: hadirCount || 0,
          pelanggaran: pelCount || 0,
          prestasi: presCount || 0
        });
      } catch (error) {
        console.error("Error loading dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [currentUser.id]);

  const Card = ({ title, count, color, icon, suffix = '' }: any) => (
    <div className={`bg-gray-800 p-6 rounded-lg shadow border-l-4 ${color} flex items-center justify-between`}>
      <div>
        <h3 className="text-gray-400 text-sm font-medium uppercase">{title}</h3>
        <p className="text-3xl font-bold text-white mt-1">
           {loading ? '...' : count} <span className="text-sm text-gray-500 font-normal">{suffix}</span>
        </p>
      </div>
      <div className="text-3xl opacity-50">{icon}</div>
    </div>
  );

  return (
    <div className="p-4">
      <h2 className="text-3xl font-bold text-white mb-2">Dashboard Guru Wali</h2>
      <p className="text-gray-400 mb-8">Ringkasan data kelas binaan Anda hari ini.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card title="Siswa Binaan" count={stats.siswaBinaan} icon="👩‍🎓" color="border-primary" suffix="Siswa" />
        <Card title="Hadir Hari Ini" count={stats.hadirHariIni} icon="✅" color="border-green-500" suffix="Siswa" />
        <Card title="Total Pelanggaran" count={stats.pelanggaran} icon="⚠️" color="border-red-500" suffix="Kasus" />
        <Card title="Total Prestasi" count={stats.prestasi} icon="🏆" color="border-yellow-500" suffix="Capaian" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-blue-400 mb-3">Aksi Cepat</h3>
            <div className="space-y-2 text-sm text-gray-300">
                <p>👉 Pastikan absensi hari ini sudah diisi sebelum jam 10.00.</p>
                <p>👉 Cek menu Pelanggaran jika ada laporan siswa bermasalah.</p>
            </div>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Info Sistem</h3>
            <p className="text-sm text-gray-300">Anda login sebagai <strong>{currentUser.nama}</strong>.</p>
            <p className="text-sm text-gray-400 mt-1">Gunakan sidebar kiri untuk navigasi lengkap.</p>
        </div>
      </div>
    </div>
  );
};