import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Mapel } from '../types';
import Papa from 'papaparse';
import { ConfirmDialog } from './ConfirmDialog';

interface CrudMapelProps {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const CrudMapel: React.FC<CrudMapelProps> = ({ showToast }) => {
  const [data, setData] = useState<Mapel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Mapel>>({});
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const { data: mapelData, error } = await supabase.from('mapel').select('*').order('nama', { ascending: true });
      if (error) throw error;
      setData(mapelData || []);
    } catch (error) {
      showToast('Gagal memuat data mapel', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('mapel_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mapel' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('mapel').delete().eq('id', deleteId);
      if (error) throw error;
      showToast('Mapel dihapus', 'success');
      fetchData();
    } catch (error) {
      showToast('Gagal menghapus data', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing && formData.id) {
        const { error } = await supabase.from('mapel').update({ kode: formData.kode, nama: formData.nama }).eq('id', formData.id);
        if (error) throw error;
        showToast('Mapel diperbarui', 'success');
      } else {
        const { error } = await supabase.from('mapel').insert([{ kode: formData.kode, nama: formData.nama }]);
        if (error) throw error;
        showToast('Mapel ditambahkan', 'success');
      }
      setIsModalOpen(false);
      setFormData({});
      fetchData();
    } catch (error: any) {
        const msg = error.code === '23505' ? 'Kode mapel sudah digunakan' : 'Gagal menyimpan data';
        showToast(msg, 'error');
    }
  };

  const openModal = (item?: Mapel) => {
    if (item) { setIsEditing(true); setFormData(item); }
    else { setIsEditing(false); setFormData({}); }
    setIsModalOpen(true);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      { kode: 'MAT', nama: 'Matematika' },
      { kode: 'BIN', nama: 'Bahasa Indonesia' },
      { kode: 'IPA', nama: 'Ilmu Pengetahuan Alam' }
    ];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.setAttribute('download', 'template_import_mapel.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress(0);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // Expected columns: kode, nama
          const parsedData = results.data.map((row: any) => ({
            kode: row.kode ? String(row.kode).trim() : '',
            nama: row.nama ? String(row.nama).trim() : ''
          })).filter((row: any) => row.kode !== '' && row.nama !== '');

          if (parsedData.length === 0) {
              throw new Error('Data CSV kosong');
          }

          // Batch Processing
          const BATCH_SIZE = 50;
          const total = parsedData.length;
          
          for (let i = 0; i < total; i += BATCH_SIZE) {
             const batch = parsedData.slice(i, i + BATCH_SIZE);
             const { error } = await supabase.from('mapel').upsert(batch, { onConflict: 'kode' });
             
             if (error) throw error;

             // Update Progress
             const currentProgress = Math.min(Math.round(((i + batch.length) / total) * 100), 100);
             setImportProgress(currentProgress);
          }
          
          showToast(`Berhasil mengimport ${total} data mapel`, 'success');
          fetchData();
        } catch (error) {
          console.error(error);
          showToast('Gagal mengimport CSV. Pastikan format benar.', 'error');
        } finally {
          setIsImporting(false);
          setImportProgress(0);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        setIsImporting(false);
        showToast('Gagal membaca file CSV', 'error');
      }
    });
  };

  return (
    <div>
      <ConfirmDialog
        isOpen={!!deleteId}
        message="Hapus mata pelajaran ini?"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Mata Pelajaran</h2>
        <div className="flex gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-500 transition flex items-center gap-2"
            >
              📥 Template
            </button>
            <input 
              type="file" 
              accept=".csv" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
            >
              📂 Import CSV
            </button>
            <button onClick={() => openModal()} className="bg-primary text-white px-4 py-2 rounded hover:bg-secondary transition">+ Tambah Mapel</button>
        </div>
      </div>

      {/* Import Progress Overlay */}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-80 md:w-96 text-center">
            <h3 className="text-white font-bold mb-4 text-lg">Mengimport Data...</h3>
            <div className="w-full bg-gray-700 rounded-full h-4 mb-2 overflow-hidden">
               <div 
                 className="bg-green-500 h-4 rounded-full transition-all duration-300" 
                 style={{ width: `${importProgress}%` }}
               ></div>
            </div>
            <p className="text-gray-300 font-medium">{importProgress}%</p>
            <p className="text-gray-500 text-sm mt-1">Mohon jangan tutup halaman ini.</p>
          </div>
        </div>
      )}

      {loading ? <p className="text-gray-400">Memuat data...</p> : (
        <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Mapel</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {data.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-bold">{item.kode}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{item.nama}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => openModal(item)} className="text-indigo-400 hover:text-indigo-300 mr-4">Edit</button>
                    <button onClick={() => handleDeleteClick(item.id)} className="text-red-400 hover:text-red-300">Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-4 text-white">{isEditing ? 'Edit Mapel' : 'Tambah Mapel'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300">Kode Mapel *</label>
                <input
                  type="text"
                  required
                  value={formData.kode || ''}
                  onChange={(e) => setFormData({ ...formData, kode: e.target.value })}
                  placeholder="Contoh: MTK"
                  className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm text-white placeholder-gray-400 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300">Nama Mapel *</label>
                <input
                  type="text"
                  required
                  value={formData.nama || ''}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  placeholder="Contoh: Matematika"
                  className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm text-white placeholder-gray-400 focus:ring-primary focus:border-primary"
                />
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