import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Guru } from '../types';
import Papa from 'papaparse';
import { ConfirmDialog } from './ConfirmDialog';

interface CrudGuruProps {
  showToast: (msg: string, type: 'success' | 'error', duration?: number, position?: 'top-right' | 'center') => void;
}

export const CrudGuru: React.FC<CrudGuruProps> = ({ showToast }) => {
  const [data, setData] = useState<Guru[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Guru>>({});
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPeran, setFilterPeran] = useState('');

  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const { data: guruData, error } = await supabase
        .from('guru')
        .select('*')
        .order('nama', { ascending: true });
      
      if (error) throw error;
      setData(guruData || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime subscription
    const channel = supabase
      .channel('guru_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guru' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('guru').delete().eq('id', deleteId);
      if (error) throw error;
      showToast('Data guru berhasil dihapus', 'success');
      fetchData(); // Instant update
    } catch (error) {
      showToast('Gagal menghapus data', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validasi Field Wajib
    if (!formData.nip || !formData.nama || !formData.username || !formData.password || !formData.peran) {
        showToast('Mohon lengkapi semua data wajib: NIP, Nama, Username, Password, dan Peran.', 'error');
        return;
    }

    try {
      const payload = {
        nip: formData.nip,
        nama: formData.nama,
        jenis_kelamin: formData.jenis_kelamin || 'L',
        no_hp: formData.no_hp,
        username: formData.username,
        password: formData.password, 
        peran: formData.peran
      };

      if (isEditing && formData.id) {
        // Update
        const { error } = await supabase
          .from('guru')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
        showToast('Data Guru berhasil diperbarui', 'success');
      } else {
        // Create / Upsert
        const { error } = await supabase
          .from('guru')
          .upsert([payload], { onConflict: 'username' }); 
        
        if (error) throw error;
        showToast('Guru berhasil ditambahkan', 'success');
      }
      setIsModalOpen(false);
      setFormData({});
      fetchData(); // Instant update
    } catch (error: any) {
        const msg = error.code === '23505' ? 'Username sudah digunakan, silakan ganti.' : 'Gagal menyimpan data';
        showToast(msg, 'error');
    }
  };

  const openModal = (guru?: Guru) => {
    if (guru) {
      setIsEditing(true);
      setFormData(guru);
    } else {
      setIsEditing(false);
      // Default Value: GURU
      setFormData({ peran: 'GURU', jenis_kelamin: 'L', password: '' });
    }
    setIsModalOpen(true);
  };

  const handleExport = () => {
    if (data.length === 0) {
      showToast('Tidak ada data untuk diekspor', 'error');
      return;
    }

    const exportData = data.map(guru => ({
      'NIP': guru.nip ? `'${guru.nip}` : '-', 
      'Nama Lengkap': guru.nama,
      'Username': guru.username,
      'Password': guru.password || '',
      'Peran': guru.peran,
      'Jenis Kelamin': guru.jenis_kelamin,
      'No HP': guru.no_hp ? `'${guru.no_hp}` : '-'
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.setAttribute('download', `data_guru_gurwal_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        nip: '198001012005011001',
        nama: 'Contoh Guru',
        jenis_kelamin: 'L',
        no_hp: '081234567890',
        username: 'guru01',
        password: 'password123',
        peran: 'GURU'
      },
      {
        nip: '198502022010012002',
        nama: 'Contoh Admin',
        jenis_kelamin: 'P',
        no_hp: '089876543210',
        username: 'admin01',
        password: 'password123',
        peran: 'ADMIN'
      }
    ];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.setAttribute('download', 'template_import_guru.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Step 1: Parse and Validate
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const errorMessages: string[] = [];
        
        const parsedData = results.data.map((row: any, index: number) => {
            const rowNum = index + 2;

            // Sanitize
            const nama = row.nama ? String(row.nama).trim() : '';
            const username = row.username ? String(row.username).trim() : '';
            const nip = row.nip ? String(row.nip).replace(/['"]/g, '').trim() : null;
            const no_hp = row.no_hp ? String(row.no_hp).replace(/['"]/g, '').trim() : null;
            const jenis_kelamin = row.jenis_kelamin ? String(row.jenis_kelamin).trim().toUpperCase() : 'L';
            const peranRaw = row.peran ? String(row.peran).trim().toUpperCase() : 'GURU';
            const peran = (peranRaw === 'ADMIN') ? 'ADMIN' : 'GURU'; // Default to GURU if unknown
            const password = row.password ? String(row.password).trim() : '123456';

            // Validation
            if (!nama) errorMessages.push(`Baris ${rowNum}: Nama kosong.`);
            if (!username) errorMessages.push(`Baris ${rowNum}: Username kosong.`);

            return {
              nip: nip === '' ? null : nip,
              nama,
              jenis_kelamin: jenis_kelamin === 'P' ? 'P' : 'L',
              no_hp: no_hp === '' ? null : no_hp,
              username,
              password, 
              peran
            };
        }).filter((row: any) => row.nama !== '');

        if (errorMessages.length > 0) {
            const maxErrors = 5;
            const displayErrors = errorMessages.slice(0, maxErrors).join('\n');
            const suffix = errorMessages.length > maxErrors ? `\n...dan ${errorMessages.length - maxErrors} kesalahan lainnya.` : '';
            
            showToast(
                `Gagal Membaca CSV. Perbaiki data berikut:\n${displayErrors}${suffix}`, 
                'error', 
                10000, 
                'center'
            );
            
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        if (parsedData.length === 0) {
            showToast('File CSV kosong atau format salah', 'error');
        } else {
            setPreviewData(parsedData);
            setShowPreview(true);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (error) => {
        showToast('Gagal membaca file CSV: ' + error.message, 'error');
      }
    });
  };

  // Step 2: Save to DB
  const handleSaveImport = async () => {
    setIsImporting(true);
    setImportProgress(0);
    setShowPreview(false);

    try {
        const total = previewData.length;
        const BATCH_SIZE = 50;
        
        for (let i = 0; i < total; i += BATCH_SIZE) {
             const batch = previewData.slice(i, i + BATCH_SIZE);
             const { error } = await supabase.from('guru').upsert(batch, { onConflict: 'username' });
             
             if (error) throw error;
             const currentProgress = Math.min(Math.round(((i + batch.length) / total) * 100), 100);
             setImportProgress(currentProgress);
        }
        
        showToast(`Berhasil mengimport ${total} data guru`, 'success');
        setPreviewData([]);
        fetchData();
    } catch (error: any) {
        showToast('Gagal menyimpan data ke database: ' + (error.message || 'Unknown'), 'error', 10000, 'center');
    } finally {
        setIsImporting(false);
        setImportProgress(0);
    }
  };

  // Filter Logic
  const filteredData = data.filter(guru => {
    const matchesSearch = 
      guru.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (guru.nip && guru.nip.includes(searchTerm)) ||
      guru.username.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterPeran === '' || guru.peran === filterPeran;

    return matchesSearch && matchesRole;
  });

  return (
    <div>
      <ConfirmDialog 
        isOpen={!!deleteId}
        message="Yakin ingin menghapus data guru ini?"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-white">Manajemen Guru</h2>
        <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center gap-2"
            >
              📥 Ekspor Data
            </button>
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
            <button
              onClick={() => openModal()}
              className="bg-primary text-white px-4 py-2 rounded hover:bg-secondary transition"
            >
              + Tambah Guru
            </button>
        </div>
      </div>

      {/* Import Progress Overlay */}
      {isImporting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80">
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

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-5xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <h3 className="text-xl font-bold mb-4 text-white">Preview Data Import ({previewData.length} Guru)</h3>
                <div className="flex-1 overflow-auto border border-gray-700 rounded mb-4">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">NIP</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Nama Lengkap</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Username</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Password</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Peran</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">L/P</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {previewData.slice(0, 100).map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-700">
                                    <td className="px-4 py-2 text-sm text-gray-300">{row.nip || '-'}</td>
                                    <td className="px-4 py-2 text-sm text-white font-medium">{row.nama}</td>
                                    <td className="px-4 py-2 text-sm text-blue-300">{row.username}</td>
                                    <td className="px-4 py-2 text-sm text-gray-400">{row.password}</td>
                                    <td className="px-4 py-2 text-sm text-gray-300">{row.peran}</td>
                                    <td className="px-4 py-2 text-sm text-gray-300">{row.jenis_kelamin}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {previewData.length > 100 && (
                        <div className="p-2 text-center text-gray-500 text-sm bg-gray-700">
                            ... dan {previewData.length - 100} baris lainnya.
                        </div>
                    )}
                </div>
                <div className="flex justify-end space-x-3">
                    <button 
                        onClick={() => { setShowPreview(false); setPreviewData([]); }}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                    >
                        Batal
                    </button>
                    <button 
                        onClick={handleSaveImport}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                    >
                        📥 Simpan ke Database
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Cari Nama / NIP / Username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="w-full md:w-64">
           <select
             value={filterPeran}
             onChange={(e) => setFilterPeran(e.target.value)}
             className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-primary"
           >
             <option value="">Semua Peran</option>
             <option value="ADMIN">Admin</option>
             <option value="GURU">Guru</option>
           </select>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Memuat data...</p>
      ) : (
        <div className="bg-gray-800 shadow overflow-x-auto rounded-lg border border-gray-700">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nama / NIP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">L/P</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">No HP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Akun</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Peran</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {filteredData.map((guru) => (
                <tr key={guru.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">{guru.nama}</div>
                    <div className="text-sm text-gray-400">{guru.nip || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{guru.jenis_kelamin}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{guru.no_hp}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     <div className="text-sm text-white">{guru.username}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        guru.peran === 'ADMIN' ? 'bg-blue-900 text-blue-200' : 'bg-green-900 text-green-200'
                     }`}>
                        {guru.peran}
                     </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => openModal(guru)} className="text-indigo-400 hover:text-indigo-300 mr-4">Edit</button>
                    <button onClick={() => handleDeleteClick(guru.id)} className="text-red-400 hover:text-red-300">Hapus</button>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    Tidak ada data guru yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto border border-gray-700">
            <h3 className="text-lg font-bold mb-4 text-white">{isEditing ? 'Edit Guru' : 'Tambah Guru'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Field Peran */}
              <div>
                   <label className="block text-sm font-medium text-gray-300">Peran *</label>
                   <select
                      value={formData.peran || 'GURU'}
                      onChange={(e) => setFormData({ ...formData, peran: e.target.value })}
                      className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-primary focus:border-primary"
                   >
                     <option value="GURU">Guru</option>
                     <option value="ADMIN">Admin</option>
                   </select>
                   <p className="text-xs text-gray-500 mt-1">Pilih peran pengguna dalam sistem.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">NIP / NUPTK *</label>
                  <input
                    type="text"
                    required
                    value={formData.nip || ''}
                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                    className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm focus:ring-primary focus:border-primary text-white"
                  />
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-300">Jenis Kelamin</label>
                   <select
                      value={formData.jenis_kelamin || 'L'}
                      onChange={(e) => setFormData({ ...formData, jenis_kelamin: e.target.value as 'L' | 'P' })}
                      className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
                   >
                     <option value="L">Laki-laki</option>
                     <option value="P">Perempuan</option>
                   </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={formData.nama || ''}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm focus:ring-primary focus:border-primary text-white"
                />
              </div>

              <div>
                  <label className="block text-sm font-medium text-gray-300">No HP</label>
                  <input
                    type="text"
                    value={formData.no_hp || ''}
                    onChange={(e) => setFormData({ ...formData, no_hp: e.target.value })}
                    className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm text-white"
                  />
              </div>

              <div className="border-t border-gray-700 pt-4 mt-4">
                <p className="text-xs text-gray-400 mb-2">Informasi Akun Login</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300">Username *</label>
                    <input
                      type="text"
                      required
                      value={formData.username || ''}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300">Password *</label>
                    <input
                      type="text"
                      required={!isEditing}
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={isEditing ? 'Biarkan kosong jika tetap' : ''}
                      className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm text-white placeholder-gray-400"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-600 text-gray-200 rounded hover:bg-gray-500"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded hover:bg-secondary"
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