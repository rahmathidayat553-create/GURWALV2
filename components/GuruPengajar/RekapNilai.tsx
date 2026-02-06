import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Guru, Kelas, Mapel } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import Papa from 'papaparse';

interface Props {
  currentUser: Guru;
}

export const RekapNilai: React.FC<Props> = ({ currentUser }) => {
  const [kelasOptions, setKelasOptions] = useState<Kelas[]>([]);
  const [mapelOptions, setMapelOptions] = useState<Mapel[]>([]);
  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [selectedMapel, setSelectedMapel] = useState<string>('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAssignments = async () => {
      const { data } = await supabase.from('pengajaran').select('*, kelas(*), mapel(*)').eq('id_guru', currentUser.id);
      if (data) {
        // @ts-ignore
        setKelasOptions(Array.from(new Map(data.map(item => [item.id_kelas, item.kelas])).values()));
        // @ts-ignore
        setMapelOptions(Array.from(new Map(data.map(item => [item.id_mapel, item.mapel])).values()));
      }
    };
    fetchAssignments();
  }, [currentUser.id]);

  useEffect(() => {
    if (selectedKelas && selectedMapel) {
       setLoading(true);
       const loadData = async () => {
           const { data: students } = await supabase.from('siswa').select('*').eq('id_kelas', selectedKelas).order('nama');
           const { data: grades } = await supabase.from('nilai').select('*').eq('id_guru', currentUser.id).eq('id_mapel', selectedMapel);
            
           if (students && grades) {
               const processed = students.map(s => {
                   const sGrades = grades.filter(g => g.id_siswa === s.id);
                   const formatif = sGrades.find(g => g.jenis === 'FORMATIF')?.nilai || 0;
                   const sumatif = sGrades.find(g => g.jenis === 'SUMATIF')?.nilai || 0;
                   const akhir = sGrades.find(g => g.jenis === 'AKHIR_SUMATIF')?.nilai || 0;
                   const avg = (Number(formatif) + Number(sumatif) + Number(akhir)) / 3;
                   return { nama: s.nama, formatif: Number(formatif), sumatif: Number(sumatif), akhir: Number(akhir), rata: parseFloat(avg.toFixed(1)) };
               });
               setReportData(processed);
           }
           setLoading(false);
       };
       loadData();
    } else {
        setReportData([]);
    }
  }, [selectedKelas, selectedMapel, currentUser.id]);

  const handleExport = () => {
    if (reportData.length === 0) return;
    const clsName = kelasOptions.find(k => k.id === selectedKelas)?.nama || 'Kelas';
    const mapelName = mapelOptions.find(m => m.id === selectedMapel)?.nama || 'Mapel';
    const csv = Papa.unparse(reportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rekap_nilai_${clsName}_${mapelName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Rekap Nilai Siswa</h2>
          {reportData.length > 0 && <button onClick={handleExport} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition flex items-center gap-2"><span>📊</span> Ekspor Excel</button>}
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
           <select className="bg-gray-700 border border-gray-600 rounded p-2 text-white flex-1" value={selectedKelas} onChange={(e) => setSelectedKelas(e.target.value)}>
             <option value="">-- Pilih Kelas --</option>
             {kelasOptions.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
           </select>
           <select className="bg-gray-700 border border-gray-600 rounded p-2 text-white flex-1" value={selectedMapel} onChange={(e) => setSelectedMapel(e.target.value)}>
             <option value="">-- Pilih Mapel --</option>
             {mapelOptions.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
           </select>
      </div>

      {loading ? <p className="text-gray-400">Menghitung...</p> : (
         selectedKelas && selectedMapel ? (
             <div className="space-y-8">
                 <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 h-80">
                    <h3 className="text-white mb-4 text-sm font-semibold">Grafik Rata-rata Nilai</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="nama" stroke="#9CA3AF" hide />
                            <YAxis stroke="#9CA3AF" domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }} />
                            <Legend />
                            <Bar dataKey="formatif" fill="#3B82F6" name="Formatif" />
                            <Bar dataKey="sumatif" fill="#10B981" name="Sumatif" />
                            <Bar dataKey="akhir" fill="#F59E0B" name="Akhir" />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="bg-gray-800 shadow overflow-x-auto rounded-lg border border-gray-700">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Siswa</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Formatif</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Sumatif</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Akhir</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase font-bold text-white">Rata-rata</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {reportData.map((row, idx) => (
                                <tr key={idx}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{row.nama}</td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-300">{row.formatif}</td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-300">{row.sumatif}</td>
                                    <td className="px-6 py-4 text-center text-sm text-gray-300">{row.akhir}</td>
                                    <td className="px-6 py-4 text-center text-sm font-bold text-blue-400">{row.rata}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
             </div>
         ) : <div className="p-10 text-center text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">Pilih filter di atas.</div>
      )}
    </div>
  );
};