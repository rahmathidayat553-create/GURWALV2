import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru, Bimbingan, Kehadiran } from '../types';

interface GwKehadiranProps {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const GwKehadiran: React.FC<GwKehadiranProps> = ({ currentUser, showToast }) => {
  const [siswaList, setSiswaList] = useState<Bimbingan[]>([]);
  const [kehadiranList, setKehadiranList] = useState<Kehadiran[]>([]);
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  // Load students
  useEffect(() => {
    const fetchSiswa = async () => {
      const { data, error } = await supabase
        .from('bimbingan')
        .select('*, siswa(id, nama, nisn, kelas(nama))')
        .eq('id_guru', currentUser.id)
        .order('created_at', { ascending: true });
        
      if (!error && data) {
         // @ts-ignore
         setSiswaList(data);
      }
    };
    fetchSiswa();
  }, [currentUser.id]);

  // Load attendance for selected date
  const fetchKehadiran = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('kehadiran')
      .select('*')
      .eq('id_guru', currentUser.id)
      .eq('tanggal', tanggal);

    if (!error && data) {
      setKehadiranList(data as Kehadiran[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKehadiran();
    // Realtime subscription
    const channel = supabase
      .channel('kehadiran_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kehadiran', filter: `tanggal=eq.${tanggal}` }, () => {
          fetchKehadiran();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal, currentUser.id]);

  const handleStatusChange = async (id_siswa: string, status: 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPHA') => {
    // Check if exists
    const existing = kehadiranList.find(k => k.id_siswa === id_siswa);
    
    try {
      if (existing) {
        const { error } = await supabase
          .from('kehadiran')
          .update({ status })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('kehadiran')
          .insert([{
            id_guru: currentUser.id,
            id_siswa,
            tanggal,
            status
          }]);
        if (error) throw error;
      }
      showToast('Status disimpan', 'success');
      fetchKehadiran(); // Instant update
    } catch (e) {
      showToast('Gagal menyimpan status', 'error');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Input Kehadiran</h2>
      
      <div className="mb-6 bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-4">
        <label className="text-gray-300 font-medium">Pilih Tanggal:</label>
        <input 
          type="date" 
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 focus:outline-none focus:border-primary"
        />
      </div>

      <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Siswa</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kelas</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status Kehadiran</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {siswaList.map((item) => {
               const currentStatus = kehadiranList.find(k => k.id_siswa === item.id_siswa)?.status;
               return (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-medium">{item.siswa?.nama}</td>
                  {/* @ts-ignore */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{item.siswa?.kelas?.nama}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex justify-center gap-2">
                       {(['HADIR', 'SAKIT', 'IZIN', 'ALPHA'] as const).map(status => (
                         <button
                           key={status}
                           onClick={() => handleStatusChange(item.id_siswa, status)}
                           className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                             currentStatus === status 
                               ? status === 'HADIR' ? 'bg-green-600 text-white' 
                                 : status === 'SAKIT' ? 'bg-yellow-600 text-white'
                                 : status === 'IZIN' ? 'bg-blue-600 text-white'
                                 : 'bg-red-600 text-white'
                               : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                           }`}
                         >
                           {status}
                         </button>
                       ))}
                    </div>
                  </td>
                </tr>
               );
            })}
            {siswaList.length === 0 && (
               <tr><td colSpan={3} className="p-6 text-center text-gray-500">Tidak ada siswa binaan.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};