import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import Papa from 'papaparse';

interface GwLaporanProps {
  currentUser: Guru;
}

export const GwLaporan: React.FC<GwLaporanProps> = ({ currentUser }) => {
  const [summary, setSummary] = useState({ hadir: 0, sakit: 0, izin: 0, alpha: 0, pelanggaran: 0, prestasi: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 1. Get attendance stats
      const { data: attData } = await supabase
        .from('kehadiran')
        .select('status')
        .eq('id_guru', currentUser.id);

      const hadir = attData?.filter(x => x.status === 'HADIR').length || 0;
      const sakit = attData?.filter(x => x.status === 'SAKIT').length || 0;
      const izin = attData?.filter(x => x.status === 'IZIN').length || 0;
      const alpha = attData?.filter(x => x.status === 'ALPHA').length || 0;

      // 2. Get violations count
      const { count: pelCount } = await supabase
        .from('pelanggaran')
        .select('*', { count: 'exact', head: true })
        .eq('id_guru', currentUser.id);

      // 3. Get achievements count
      const { count: presCount } = await supabase
        .from('prestasi')
        .select('*', { count: 'exact', head: true })
        .eq('id_guru', currentUser.id);

      setSummary({
          hadir, sakit, izin, alpha,
          pelanggaran: pelCount || 0,
          prestasi: presCount || 0
      });
      setLoading(false);
    };

    fetchData();
  }, [currentUser.id]);

  const chartData = [
    { name: 'Hadir', jumlah: summary.hadir, fill: '#10B981' },
    { name: 'Sakit', jumlah: summary.sakit, fill: '#F59E0B' },
    { name: 'Izin', jumlah: summary.izin, fill: '#3B82F6' },
    { name: 'Alpha', jumlah: summary.alpha, fill: '#EF4444' },
  ];

  const handleExport = () => {
    const dataToExport = [
        { Kategori: 'Total Kehadiran', Jumlah: summary.hadir },
        { Kategori: 'Total Sakit', Jumlah: summary.sakit },
        { Kategori: 'Total Izin', Jumlah: summary.izin },
        { Kategori: 'Total Alpha', Jumlah: summary.alpha },
        { Kategori: 'Total Pelanggaran', Jumlah: summary.pelanggaran },
        { Kategori: 'Total Prestasi', Jumlah: summary.prestasi },
        { Kategori: 'Tanggal Cetak', Jumlah: new Date().toLocaleDateString('id-ID') }
    ];

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.setAttribute('download', `laporan_wali_kelas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Laporan Rekapitulasi</h2>
        <button 
            onClick={handleExport}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50"
        >
            <span>📊</span> Ekspor Excel
        </button>
      </div>

      {loading ? <p className="text-gray-400">Menghitung data...</p> : (
        <div className="space-y-8">
            {/* Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                    <p className="text-gray-400 text-sm">Total Pelanggaran</p>
                    <p className="text-2xl font-bold text-red-500">{summary.pelanggaran}</p>
                </div>
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                    <p className="text-gray-400 text-sm">Total Prestasi</p>
                    <p className="text-2xl font-bold text-green-500">{summary.prestasi}</p>
                </div>
                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                    <p className="text-gray-400 text-sm">Total Alpha</p>
                    <p className="text-2xl font-bold text-red-400">{summary.alpha}</p>
                </div>
                 <div className="bg-gray-800 p-4 rounded border border-gray-700">
                    <p className="text-gray-400 text-sm">Total Kehadiran</p>
                    <p className="text-2xl font-bold text-blue-400">{summary.hadir}</p>
                </div>
            </div>

            {/* Chart */}
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Grafik Kehadiran Siswa Binaan</h3>
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9CA3AF" />
                            <YAxis stroke="#9CA3AF" />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }} 
                                itemStyle={{ color: '#F3F4F6' }}
                            />
                            <Bar dataKey="jumlah" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};