import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru, Mapel, Kelas, Pengajaran } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface CrudDataPengajarProps {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const CrudDataPengajar: React.FC<CrudDataPengajarProps> = ({ showToast }) => {
  const [data, setData] = useState<Pengajaran[]>([]);
  const [gurus, setGurus] = useState<Guru[]>([]);
  const [mapels, setMapels] = useState<Mapel[]>([]);
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    id_guru: '',
    id_mapel: '',
    id_kelas: ''
  });

  // Filter state
  const [filterGuru, setFilterGuru] = useState('');

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // Corrected Join Syntax: Use table names for relations
      const { data: pengajaran, error } = await supabase
        .from('pengajaran')
        .select(`
          *,
          guru (nama, nip),
          mapel (nama, kode),
          kelas (nama)
        `)
        .order('id', { ascending: false });
      
      if (error) throw error;
      // @ts-ignore
      setData(pengajaran || []);
    } catch (e) {
      console.error(e);
      showToast('Gagal memuat data pengajaran', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchOptions = async () => {
      // Fetch ALL gurus (roles: GURU, GURU_WALI, GURU_PENGAJAR) except ADMIN
      const { data: g } = await supabase
        .from('guru')
        .select('*')
        .neq('peran', 'ADMIN')
        .order('nama');
        
      const { data: m } = await supabase.from('mapel').select('*').order('nama');
      const { data: k } = await supabase.from('kelas').select('*').order('nama');
      
      if (g) setGurus(g);
      if (m) setMapels(m);
      if (k) setKelas(k);
    };

    fetchOptions();
    fetchData();

    // Realtime subscription
    const channel = supabase
      .channel('pengajaran_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengajaran' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openModal = (item?: Pengajaran) => {
    if (item) {
        setIsEditing(true);
        setEditId(item.id);
        setFormData({
            id_guru: item.id_guru,
            id_mapel: item.id_mapel,
            id_kelas: item.id_kelas
        });
    } else {
        setIsEditing(false);
        setEditId(null);
        setFormData({ id_guru: '', id_mapel: '', id_kelas: '' });
    }
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('pengajaran').delete().eq('id', deleteId);
      if (error) throw error;
      showToast('Berhasil dihapus', 'success');
      fetchData();
    } catch (e) {
      showToast('Gagal menghapus', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Check duplicate
      let query = supabase
        .from('pengajaran')
        .select('id')
        .eq('id_guru', formData.id_guru)
        .eq('id_mapel', formData.id_mapel)
        .eq('id_kelas', formData.id_kelas);
      
      // If editing, exclude current record from duplicate check
      if (isEditing && editId) {
          query = query.neq('id', editId);
      }

      const { data: existing } = await query.maybeSingle(); 
        
      if (existing) {
        showToast('Data pengajaran ini sudah ada', 'error');
        return;
      }

      if (isEditing && editId) {
          // Update Logic
          const { error } = await supabase
            .from('pengajaran')
            .update(formData)
            .eq('id', editId);
          if (error) throw error;
          showToast('Berhasil diperbarui', 'success');
      } else {
          // Insert Logic
          const { error } = await supabase.from('pengajaran').insert([formData]);
          if (error) throw error;
          showToast('Berhasil disimpan', 'success');
      }
      
      setIsModalOpen(false);
      setFormData({ id_guru: '', id_mapel: '', id_kelas: '' });
      setIsEditing(false);
      setEditId(null);
      fetchData();
    } catch (e) {
      showToast('Gagal menyimpan data', 'error');
    }
  };

  const filteredData = data.filter(item => 
    filterGuru === '' || item.id_guru === filterGuru
  );

  return (
    <div>
      <ConfirmDialog
        isOpen={!!deleteId}
        message="Hapus data pengajaran ini?"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Data Pengajar</h2>
        <button onClick={() => openModal()} className="bg-primary text-white px-4 py-2 rounded hover:bg-secondary transition">+ Tambah Pengajar</button>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 mb-6">
         <label className="block text-sm font-medium text-gray-300 mb-1">Filter Guru:</label>
         <select
            value={filterGuru}
            onChange={(e) => setFilterGuru(e.target.value)}
            className="w-full md:w-1/3 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-primary"
         >
            <option value="">Semua Guru Pengajar</option>
            {gurus.map(g => <option key={g.id} value={g.id}>{g.nama} ({g.nip || '-'})</option>)}
         </select>
      </div>

      {loading ? <p className="text-gray-400">Memuat data...</p> : (
        <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
           <table className="min-w-full divide-y divide-gray-700">
             <thead className="bg-gray-700">
               <tr>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Guru</th>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Mata Pelajaran</th>
                 <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kelas</th>
                 <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Aksi</th>
               </tr>
             </thead>
             <tbody className="bg-gray-800 divide-y divide-gray-700">
               {filteredData.map(item => (
                 <tr key={item.id}>
                   <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-white">{item.guru?.nama || <span className="text-red-400 text-xs italic">Data guru tidak ditemukan</span>}</div>
                      {item.guru?.nip && <div className="text-xs text-gray-400">{item.guru.nip}</div>}
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                      {item.mapel?.nama} <span className="text-gray-500 text-xs">({item.mapel?.kode})</span>
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-gray-300 font-bold">{item.kelas?.nama}</td>
                   <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => openModal(item)} className="text-indigo-400 hover:text-indigo-300 mr-4">Edit</button>
                      <button onClick={() => handleDeleteClick(item.id)} className="text-red-400 hover:text-red-300">Hapus</button>
                   </td>
                 </tr>
               ))}
               {filteredData.length === 0 && (
                   <tr><td colSpan={4} className="p-6 text-center text-gray-500">Tidak ada data pengajaran.</td></tr>
               )}
             </tbody>
           </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4 text-white">{isEditing ? 'Edit Pengajaran' : 'Tambah Pengajaran'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300">Guru Pengajar *</label>
                <select
                  required
                  value={formData.id_guru}
                  onChange={(e) => setFormData({...formData, id_guru: e.target.value})}
                  className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-primary"
                >
                  <option value="">-- Pilih Guru --</option>
                  {gurus.map(g => <option key={g.id} value={g.id}>{g.nama} ({g.nip || '-'})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300">Mata Pelajaran *</label>
                <select
                  required
                  value={formData.id_mapel}
                  onChange={(e) => setFormData({...formData, id_mapel: e.target.value})}
                  className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-primary"
                >
                  <option value="">-- Pilih Mapel --</option>
                  {mapels.map(m => <option key={m.id} value={m.id}>{m.nama} ({m.kode})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300">Kelas *</label>
                <select
                  required
                  value={formData.id_kelas}
                  onChange={(e) => setFormData({...formData, id_kelas: e.target.value})}
                  className="mt-1 w-full bg-gray-700 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-primary"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {kelas.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-600 text-gray-200 rounded hover:bg-gray-500">Batal</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-secondary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};