import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru } from '../types';

interface GuruDashboardProps {
  currentUser: Guru;
}

export const GuruDashboard: React.FC<GuruDashboardProps> = ({ currentUser }) => {
  const [binaanStats, setBinaanStats] = useState({
    totalSiswa: 0,
    hadirHariIni: 0,
    masalah: 0
  });
  
  const [ajarStats, setAjarStats] = useState({
    totalKelas: 0,
    totalMapel: 0,
    totalNilai: 0
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllStats = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        // 1. STATS BINAAN (Wali Kelas)
        const { count: siswaCount } = await supabase
          .from('bimbingan')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id);

        const { count: hadirCount } = await supabase
          .from('kehadiran')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id)
          .eq('tanggal', today)
          .eq('status', 'HADIR');
          
        const { count: pelCount } = await supabase
          .from('pelanggaran')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id);

        setBinaanStats({
          totalSiswa: siswaCount || 0,
          hadirHariIni: hadirCount || 0,
          masalah: pelCount || 0
        });

        // 2. STATS PENGAJARAN
        const { data: pengajaran } = await supabase
          .from('pengajaran')
          .select('id_kelas, id_mapel')
          .eq('id_guru', currentUser.id);
          
        const uniqueKelas = new Set(pengajaran?.map(p => p.id_kelas)).size;
        const uniqueMapel = new Set(pengajaran?.map(p => p.id_mapel)).size;

        const { count: nilaiCount } = await supabase
          .from('nilai')
          .select('*', { count: 'exact', head: true })
          .eq('id_guru', currentUser.id);

        setAjarStats({
            totalKelas: uniqueKelas,
            totalMapel: uniqueMapel,
            totalNilai: nilaiCount || 0
        });

      } catch (error) {
        console.error("Error loading dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllStats();
  }, [currentUser.id]);

  const Card = ({ title, count, color, icon, suffix }: any) => (
    <div className={`bg-gray-800 p-6 rounded-lg shadow border-l-4 ${color} flex items-center justify-between`}>
      <div>
        <h3 className="text-gray-400 text-sm font-medium uppercase">{title}</h3>
        <p className="text-3xl font-bold text-white mt-1">
           {loading ? '...' : count} <span className="text-xs text-gray-500 font-normal">{suffix}</span>
        </p>
      </div>
      <div className="text-3xl opacity-50">{icon}</div>
    </div>
  );

  return (
    <div className="p-4 space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white">Dashboard Guru</h2>
        <p className="text-gray-400">Selamat datang, {currentUser.nama}. Berikut ringkasan aktivitas Anda.</p>
      </div>

      {/* SECTION BINAAN */}
      <div>
        <h3 className="text-xl font-bold text-blue-400 mb-4 flex items-center gap-2">
            <span>📋</span> Binaan (Wali Kelas)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card title="Siswa Binaan" count={binaanStats.totalSiswa} icon="👨‍🎓" color="border-blue-500" suffix="Siswa" />
            <Card title="Hadir Hari Ini" count={binaanStats.hadirHariIni} icon="✅" color="border-green-500" suffix="Siswa" />
            <Card title="Catatan Pelanggaran" count={binaanStats.masalah} icon="⚠️" color="border-red-500" suffix="Kasus" />
        </div>
        {binaanStats.totalSiswa === 0 && (
            <div className="mt-2 text-sm text-gray-500 italic">
                * Anda belum memiliki siswa binaan. Hubungi admin jika Anda adalah Wali Kelas.
            </div>
        )}
      </div>

      {/* SECTION PENGAJARAN */}
      <div>
        <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
            <span>📘</span> Pengajaran (Mata Pelajaran)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card title="Kelas Diajar" count={ajarStats.totalKelas} icon="🏫" color="border-purple-500" suffix="Kelas" />
            <Card title="Mapel Diampu" count={ajarStats.totalMapel} icon="📚" color="border-indigo-500" suffix="Mapel" />
            <Card title="Data Nilai Masuk" count={ajarStats.totalNilai} icon="📊" color="border-yellow-500" suffix="Data" />
        </div>
        {ajarStats.totalKelas === 0 && (
            <div className="mt-2 text-sm text-gray-500 italic">
                * Belum ada data pengajaran yang ditugaskan kepada Anda.
            </div>
        )}
      </div>
    </div>
  );
};