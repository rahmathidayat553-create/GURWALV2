import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Guru, Bimbingan, Prestasi } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

interface Props {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const PrestasiBinaan: React.FC<Props> = ({ currentUser, showToast }) => {
  const [siswaList, setSiswaList] = useState<Bimbingan[]>([]);
  const [data, setData] = useState<Prestasi[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Prestasi>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    const { data: presData, error } = await supabase
      .from('prestasi')
      .select('*, siswa(nama)')
      .eq('id_guru', currentUser.id)
      .order('tanggal', { ascending: false });

    if (!error && presData) {
        // @ts-ignore
        setData(presData);
    }
  };

  useEffect(() => {
    const fetchSiswa = async () => {
        const { data } = await supabase.from('bimbingan').select('*, siswa(id, nama)').eq('id_guru', currentUser.id);
        // @ts-ignore
        if (data) setSiswaList(data);
    };
    fetchSiswa();
    fetchData();

    const channel = supabase
      .channel('prestasi_change')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestasi', filter: `id_guru=eq.${currentUser.id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const { error } = await supabase.from('prestasi').insert([{
            id_guru: currentUser.id,
            id_siswa: formData.id_siswa,
            deskripsi: formData.deskripsi,
            tingkat: formData.tingkat,
            tanggal: formData.tanggal || new Date().toISOString().split('T')[0]
        }]);
        if (error) throw error;
        showToast('Prestasi dicatat', 'success');
        setIsModalOpen(false);
        setFormData({});
        fetchData();
    } catch (e) {
        showToast('Gagal menyimpan', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('prestasi').delete().eq('id', deleteId);
    if(error) showToast("Gagal hapus", "error");
    else {
      showToast("Terhapus", "success");
      fetchData();
    }
    setDeleteId(null);
  }

  return (
    <div>
      <ConfirmDialog isOpen={!!deleteId} message="Hapus data prestasi ini?" onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Catatan Prestasi (Binaan)</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">+ Catat Prestasi</button>
      </div>

      <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tanggal</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Siswa</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Prestasi</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tingkat</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
             {data.map(item => (
                 <tr key={item.id}>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.tanggal}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">{item.siswa?.nama}</td>
                     <td className="px-6 py-4 text-sm text-gray-300">{item.deskripsi}</td>
                     <td className="px-6 py-4 text-sm text-gray-300">{item.tingkat || '-'}</td>
                     <td className="px-6 py-4 text-right">
                         <button onClick={() => setDeleteId(item.id)} className="text-red-400 hover:text-red-300 text-sm">Hapus</button>
                     </td>
                 </tr>
             ))}
             {data.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">Belum ada data prestasi.</td></tr>}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 border border-gray-700">
             <h3 className="text-lg font-bold mb-4 text-white">Input Prestasi</h3>
             <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Siswa</label>
                    <select required className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white" onChange={e => setFormData({...formData, id_siswa: e.target.value})}>
                        <option value="">-- Pilih Siswa --</option>
                        {siswaList.map(s => <option key={s.id_siswa} value={s.id_siswa}>{s.siswa?.nama}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Tanggal</label>
                    <input type="date" required className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white" onChange={e => setFormData({...formData, tanggal: e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Deskripsi</label>
                    <input type="text" required className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white" placeholder="Juara 1..." onChange={e => setFormData({...formData, deskripsi: e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Tingkat</label>
                    <select className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white" onChange={e => setFormData({...formData, tingkat: e.target.value})}>
                        <option value="">-- Pilih --</option>
                        <option value="Sekolah">Sekolah</option>
                        <option value="Kabupaten">Kabupaten</option>
                        <option value="Provinsi">Provinsi</option>
                        <option value="Nasional">Nasional</option>
                    </select>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-600 text-gray-200 rounded">Batal</button>
                    <button type="submit" className="px-4 py-2 bg-primary text-white rounded">Simpan</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};