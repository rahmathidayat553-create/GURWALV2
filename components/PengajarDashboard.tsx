import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru } from '../types';

interface PengajarDashboardProps {
  currentUser: Guru;
}

export const PengajarDashboard: React.FC<PengajarDashboardProps> = ({ currentUser }) => {
  const [stats, setStats] = useState({
    kelasAjar: 0,
    mapelAjar: 0,
    totalNilai: 0,
    rataRata: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // 1. Get unique classes & mapel from assignments
        const { data: pengajaran } = await supabase
          .from('pengajaran')
          .select('id_kelas, id_mapel')
          .eq('id_guru', currentUser.id);

        const uniqueKelas = new Set(pengajaran?.map(p => p.id_kelas)).size;
        const uniqueMapel = new Set(pengajaran?.map(p => p.id_mapel)).size;

        // 2. Get grades stats (count & avg)
        const { data: nilaiData } = await supabase
          .from('nilai')
          .select('nilai')
          .eq('id_guru', currentUser.id);

        const totalNilai = nilaiData?.length || 0;
        const sumNilai = nilaiData?.reduce((acc, curr) => acc + (curr.nilai || 0), 0) || 0;
        const avg = totalNilai > 0 ? parseFloat((sumNilai / totalNilai).toFixed(1)) : 0;

        // @ts-ignore
        setStats({
          kelasAjar: uniqueKelas,
          mapelAjar: uniqueMapel,
          totalNilai,
          rataRata: avg
        });

      } catch (error) {
        console.error("Error fetching pengajar stats", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [currentUser.id]);

  const Card = ({ title, count, color, icon, subtext }: any) => (
    <div className={`bg-gray-800 p-6 rounded-lg shadow border-l-4 ${color} flex items-center justify-between`}>
      <div>
        <h3 className="text-gray-400 text-sm font-medium uppercase">{title}</h3>
        <p className="text-3xl font-bold text-white mt-1">{loading ? '...' : count}</p>
        {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
      </div>
      <div className="text-3xl opacity-50">{icon}</div>
    </div>
  );

  return (
    <div className="p-4">
      <h2 className="text-3xl font-bold text-white mb-2">Dashboard Pengajar</h2>
      <p className="text-gray-400 mb-8">Ringkasan aktivitas pengajaran Anda.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card title="Kelas Diajar" count={stats.kelasAjar} icon="🏫" color="border-indigo-500" subtext="Kelas Aktif" />
        <Card title="Mapel Diampu" count={stats.mapelAjar} icon="📘" color="border-blue-500" subtext="Mata Pelajaran" />
        <Card title="Data Nilai" count={stats.totalNilai} icon="📊" color="border-green-500" subtext="Total Input" />
        <Card title="Rata-rata Nilai" count={stats.rataRata} icon="📈" color="border-yellow-500" subtext="Seluruh Siswa" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Panduan Penilaian</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-2 text-sm">
             <li>Gunakan menu <strong>Penilaian</strong> untuk input nilai Formatif dan Sumatif.</li>
             <li>Nilai tersimpan otomatis saat Anda berpindah kolom input (auto-save).</li>
             <li>Gunakan menu <strong>Rekap Nilai</strong> untuk melihat grafik perkembangan siswa dan mengekspor ke Excel.</li>
          </ul>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">Akun</h3>
          <p className="text-sm text-gray-400">Pengajar: <span className="text-white font-bold">{currentUser.nama}</span></p>
          <p className="text-sm text-gray-400">NIP: {currentUser.nip || '-'}</p>
        </div>
      </div>
    </div>
  );
};