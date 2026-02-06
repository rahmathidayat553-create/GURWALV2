import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Guru, Pengajaran } from '../../types';

interface Props {
  currentUser: Guru;
}

export const DaftarKelasAjar: React.FC<Props> = ({ currentUser }) => {
  const [data, setData] = useState<Pengajaran[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: result } = await supabase
        .from('pengajaran')
        .select('*, kelas(nama, kode), mapel(nama, kode)')
        .eq('id_guru', currentUser.id)
        .order('id_kelas');
      
      // @ts-ignore
      if (result) setData(result);
      setLoading(false);
    };
    fetchData();
  }, [currentUser.id]);

  return (
    <div>
        <h2 className="text-2xl font-bold text-white mb-6">Jadwal / Kelas Ajar</h2>
        {loading ? <p className="text-gray-400">Memuat...</p> : (
             <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kelas</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kode Kelas</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Mata Pelajaran</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {data.map((item, idx) => (
                            <tr key={idx}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">{item.kelas?.nama}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.kelas?.kode}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-300">{item.mapel?.nama}</td>
                            </tr>
                        ))}
                        {data.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-gray-500">Tidak ada jadwal mengajar.</td></tr>}
                    </tbody>
                </table>
             </div>
        )}
    </div>
  );
};