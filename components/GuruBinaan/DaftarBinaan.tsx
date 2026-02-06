import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Guru, Bimbingan } from '../../types';

interface Props {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const DaftarBinaan: React.FC<Props> = ({ currentUser, showToast }) => {
  const [data, setData] = useState<Bimbingan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const { data: bimbinganData, error } = await supabase
        .from('bimbingan')
        .select('*, siswa(*, kelas(*))')
        .eq('id_guru', currentUser.id);

      if (error) throw error;
      // @ts-ignore
      setData(bimbinganData || []);
    } catch (error) {
      showToast('Gagal memuat siswa binaan', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Siswa Binaan</h2>

      {loading ? (
        <p className="text-gray-400">Memuat data...</p>
      ) : (
        <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
           {data.length === 0 ? (
               <div className="p-6 text-center text-gray-400">Belum ada siswa binaan yang ditugaskan.</div>
           ) : (
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">NISN</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">L/P</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">No HP</th>
                </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                {data.map((item) => (
                    <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{item.siswa?.nama}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.siswa?.nisn}</td>
                    {/* @ts-ignore */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.siswa?.kelas?.nama || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.siswa?.jenis_kelamin}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.siswa?.no_hp || '-'}</td>
                    </tr>
                ))}
                </tbody>
            </table>
           )}
        </div>
      )}
    </div>
  );
};