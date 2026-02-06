import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { KalenderPendidikan } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface CrudKalenderProps {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const CrudKalender: React.FC<CrudKalenderProps> = ({ showToast }) => {
  const [data, setData] = useState<KalenderPendidikan[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<KalenderPendidikan>>({});
  
  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('kalender_pendidikan')
        .select('*')
        .order('tanggal', { ascending: true });

      if (error) throw error;
      // @ts-ignore
      setData(data || []);
    } catch (error) {
      showToast('Gagal memuat data kalender', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple validation
    if (!formData.tanggal || !formData.jenis) {
        showToast('Tanggal dan Jenis Libur wajib diisi', 'error');
        return;
    }

    try {
      if (isEditing && formData.id) {
        // UPDATE: Tanggal tidak boleh diubah saat edit (sesuai req)
        const { error } = await supabase
          .from('kalender_pendidikan')
          .update({
            jenis: formData.jenis,
            keterangan: formData.keterangan
          })
          .eq('id', formData.id);

        if (error) throw error;
        showToast('Data kalender berhasil diperbarui', 'success');
      } else {
        // INSERT
        const { error } = await supabase
          .from('kalender_pendidikan')
          .insert([{
            tanggal: formData.tanggal,
            jenis: formData.jenis,
            keterangan: formData.keterangan
          }]);

        if (error) {
            // Check for duplicate key violation (code 23505)
            if (error.code === '23505') {
                showToast('Tanggal ini sudah terdaftar sebagai hari libur.', 'error');
                return;
            }
            throw error;
        }
        showToast('Hari libur berhasil ditambahkan', 'success');
      }

      setIsModalOpen(false);
      setFormData({});
      fetchData();
    } catch (error: any) {
      console.error(error);
      showToast('Gagal menyimpan data: ' + (error.message || 'Unknown'), 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('kalender_pendidikan').delete().eq('id', deleteId);
      if (error) throw error;
      
      showToast('Hari libur berhasil dihapus', 'success');
      fetchData();
    } catch (error) {
      showToast('Gagal menghapus data', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const openModal = (item?: KalenderPendidikan) => {
    if (item) {
      setIsEditing(true);
      setFormData(item);
    } else {
      setIsEditing(false);
      setFormData({
          jenis: 'LIBUR_NASIONAL',
          keterangan: ''
      });
    }
    setIsModalOpen(true);
  };

  // Helper untuk format tanggal Indonesia
  const formatDate = (dateString: string) => {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return date.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
      });
  };

  // Helper untuk cek apakah tanggal sudah lewat
  const isPastDate = (dateString: string) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const date = new Date(dateString);
      return date < today;
  };

  // Helper Badge Warna
  const getBadgeColor = (jenis: string) => {
      switch (jenis) {
          case 'LIBUR_NASIONAL': return 'bg-red-900/50 text-red-200 border-red-800';
          case 'LIBUR_SEKOLAH': return 'bg-yellow-900/50 text-yellow-200 border-yellow-800';
          case 'CUTI_BERSAMA': return 'bg-blue-900/50 text-blue-200 border-blue-800';
          default: return 'bg-gray-700 text-gray-300';
      }
  };

  return (
    <div>
      <ConfirmDialog
        isOpen={!!deleteId}
        message="Yakin ingin menghapus hari libur ini?"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-2xl font-bold text-white">Kalender Pendidikan</h2>
            <p className="text-gray-400 text-sm">Atur jadwal libur nasional, sekolah, dan cuti bersama.</p>
        </div>
        <button 
            onClick={() => openModal()} 
            className="bg-primary text-white px-4 py-2 rounded hover:bg-secondary transition shadow-lg flex items-center gap-2"
        >
            <span>+</span> Tambah Libur
        </button>
      </div>

      <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
        {loading ? (
            <div className="p-8 text-center text-gray-400 animate-pulse">Memuat data kalender...</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tanggal</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Jenis Libur</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Keterangan</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {data.map((item) => {
                            const passed = isPastDate(item.tanggal);
                            return (
                                <tr key={item.id} className={`transition-colors ${passed ? 'bg-gray-900/50' : 'hover:bg-gray-750'}`}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm font-medium ${passed ? 'text-gray-500 line-through' : 'text-white'}`}>
                                            {formatDate(item.tanggal)}
                                        </div>
                                        {passed && <span className="text-[10px] text-gray-600 italic">Sudah berlalu</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getBadgeColor(item.jenis)} ${passed ? 'opacity-50' : ''}`}>
                                            {item.jenis.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-400">
                                        {item.keterangan || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button 
                                            onClick={() => openModal(item)} 
                                            className="text-indigo-400 hover:text-indigo-300 mr-4 disabled:opacity-30"
                                        >
                                            Edit
                                        </button>
                                        <button 
                                            onClick={() => setDeleteId(item.id)} 
                                            className="text-red-400 hover:text-red-300 disabled:opacity-30"
                                        >
                                            Hapus
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                                    Belum ada data kalender pendidikan.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-700 animate-bounce-in">
            <h3 className="text-xl font-bold mb-4 text-white">
                {isEditing ? 'Edit Hari Libur' : 'Tambah Hari Libur'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tanggal Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tanggal *</label>
                <input
                  type="date"
                  required
                  value={formData.tanggal || ''}
                  onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                  disabled={isEditing} // Tanggal Readonly saat Edit
                  className={`mt-1 block w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                {isEditing && <p className="text-xs text-yellow-500 mt-1">Tanggal tidak dapat diubah. Hapus dan buat baru jika salah.</p>}
              </div>

              {/* Jenis Select */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Jenis Libur *</label>
                <select
                  required
                  value={formData.jenis}
                  onChange={(e) => setFormData({ ...formData, jenis: e.target.value as any })}
                  className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                >
                  <option value="LIBUR_NASIONAL">Libur Nasional</option>
                  <option value="LIBUR_SEKOLAH">Libur Sekolah</option>
                  <option value="CUTI_BERSAMA">Cuti Bersama</option>
                </select>
              </div>

              {/* Keterangan Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Keterangan</label>
                <textarea
                  rows={3}
                  value={formData.keterangan || ''}
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  placeholder="Contoh: Hari Raya Idul Fitri 1445 H"
                  className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                ></textarea>
              </div>

              {/* Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-700 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition font-bold shadow-lg"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};