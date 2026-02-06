import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru, Bimbingan, Pelanggaran } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface GwPelanggaranProps {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const GwPelanggaran: React.FC<GwPelanggaranProps> = ({ currentUser, showToast }) => {
  const [siswaList, setSiswaList] = useState<Bimbingan[]>([]);
  const [data, setData] = useState<Pelanggaran[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Pelanggaran>>({});

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    // Load violations for my students
    const { data: pelData, error } = await supabase
      .from('pelanggaran')
      .select('*, siswa(nama, kelas(nama))')
      .eq('id_guru', currentUser.id)
      .order('tanggal', { ascending: false });

    if (!error && pelData) {
        // @ts-ignore
        setData(pelData);
    }
  };

  useEffect(() => {
    // Load students dropdown
    const fetchSiswa = async () => {
        const { data } = await supabase.from('bimbingan').select('*, siswa(id, nama)').eq('id_guru', currentUser.id);
        // @ts-ignore
        if (data) setSiswaList(data);
    };
    fetchSiswa();
    fetchData();

    const channel = supabase
      .channel('pelanggaran_change')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pelanggaran', filter: `id_guru=eq.${currentUser.id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const { error } = await supabase.from('pelanggaran').insert([{
            id_guru: currentUser.id,
            id_siswa: formData.id_siswa,
            deskripsi: formData.deskripsi,
            tindakan: formData.tindakan,
            tanggal: formData.tanggal || new Date().toISOString().split('T')[0]
        }]);
        if (error) throw error;
        showToast('Pelanggaran dicatat', 'success');
        setIsModalOpen(false);
        setFormData({});
        fetchData();
    } catch (e) {
        showToast('Gagal menyimpan', 'error');
    }
  };
  
  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  }

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('pelanggaran').delete().eq('id', deleteId);
    if(error) showToast("Gagal hapus", "error");
    else {
      showToast("Terhapus", "success");
      fetchData();
    }
    setDeleteId(null);
  }

  return (
    <div>
      <ConfirmDialog
        isOpen={!!deleteId}
        message="Hapus data pelanggaran ini?"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Catatan Pelanggaran</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-danger text-white px-4 py-2 rounded hover:bg-red-600 transition">+ Catat Pelanggaran</button>
      </div>

      <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tanggal</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Siswa</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Deskripsi</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tindakan</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
             {data.map(item => (
                 <tr key={item.id}>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.tanggal}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">{item.siswa?.nama}</td>
                     <td className="px-6 py-4 text-sm text-gray-300">{item.deskripsi}</td>
                     <td className="px-6 py-4 text-sm text-gray-300">{item.tindakan || '-'}</td>
                     <td className="px-6 py-4 text-right">
                         <button onClick={() => handleDeleteClick(item.id)} className="text-red-400 hover:text-red-300 text-sm">Hapus</button>
                     </td>
                 </tr>
             ))}
             {data.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">Belum ada data pelanggaran.</td></tr>}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 border border-gray-700">
             <h3 className="text-lg font-bold mb-4 text-white">Input Pelanggaran</h3>
             <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Siswa</label>
                    <select required className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                        onChange={e => setFormData({...formData, id_siswa: e.target.value})}
                    >
                        <option value="">-- Pilih Siswa --</option>
                        {siswaList.map(s => <option key={s.id_siswa} value={s.id_siswa}>{s.siswa?.nama}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Tanggal Kejadian</label>
                    <input type="date" required className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                        onChange={e => setFormData({...formData, tanggal: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Deskripsi Pelanggaran</label>
                    <textarea required className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                        rows={3}
                        onChange={e => setFormData({...formData, deskripsi: e.target.value})}
                    ></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Tindakan / Sanksi</label>
                    <input type="text" className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                        onChange={e => setFormData({...formData, tindakan: e.target.value})}
                    />
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
