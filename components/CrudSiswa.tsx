import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Siswa, Kelas } from '../types';
import * as XLSX from 'xlsx';
import { ConfirmDialog } from './ConfirmDialog';

interface CrudSiswaProps {
  showToast: (msg: string, type: 'success' | 'error', duration?: number, position?: 'top-right' | 'center') => void;
}

export const CrudSiswa: React.FC<CrudSiswaProps> = ({ showToast }) => {
  const [data, setData] = useState<Siswa[]>([]);
  const [kelasOptions, setKelasOptions] = useState<Kelas[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Siswa>>({});
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterKelas, setFilterKelas] = useState('');

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // Fetch Siswa with Kelas info (Join)
      const { data: siswaData, error: siswaError } = await supabase
        .from('siswa')
        .select('*, kelas(nama)')
        .order('nama', { ascending: true });

      if (siswaError) throw siswaError;
      // @ts-ignore - Supabase type inference for join is tricky here without generated types
      setData(siswaData || []);

      // Fetch Kelas options
      const { data: kelasData, error: kelasError } = await supabase
        .from('kelas')
        .select('*')
        .order('nama', { ascending: true });
        
      if (kelasError) throw kelasError;
      setKelasOptions(kelasData || []);

    } catch (error) {
      // console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('siswa_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'siswa' }, () => {
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
      const { error } = await supabase.from('siswa').delete().eq('id', deleteId);
      if (error) throw error;
      showToast('Siswa berhasil dihapus', 'success');
      fetchData();
    } catch (error) {
      showToast('Gagal menghapus siswa', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
        nisn: formData.nisn,
        nama: formData.nama,
        jenis_kelamin: formData.jenis_kelamin,
        tanggal_lahir: formData.tanggal_lahir,
        no_hp: formData.no_hp,
        id_kelas: formData.id_kelas === '' ? null : formData.id_kelas
    };

    try {
      if (isEditing && formData.id) {
        const { error } = await supabase.from('siswa').update(payload).eq('id', formData.id);
        if (error) throw error;
        showToast('Siswa diperbarui', 'success');
      } else {
        const { error } = await supabase.from('siswa').insert([payload]);
        if (error) throw error;
        showToast('Siswa ditambahkan', 'success');
      }
      setIsModalOpen(false);
      setFormData({});
      fetchData();
    } catch (error: any) {
        const msg = error.code === '23505' ? 'NISN sudah digunakan' : 'Gagal menyimpan data';
        showToast(msg, 'error');
    }
  };

  const openModal = (siswa?: Siswa) => {
    if (siswa) {
      setIsEditing(true);
      setFormData(siswa);
    } else {
      setIsEditing(false);
      setFormData({ jenis_kelamin: 'L', id_kelas: '' });
    }
    setIsModalOpen(true);
  };

  const handleExport = () => {
    if (data.length === 0) {
      showToast('Tidak ada data untuk diekspor', 'error');
      return;
    }

    // Format data for XLSX including ID for Mass Edit
    const exportData = data.map(siswa => ({
      'SYSTEM_ID (JANGAN UBAH)': siswa.id, // Key for locking record
      'NISN': siswa.nisn, 
      'Nama Lengkap': siswa.nama,
      'Kelas': siswa.kelas?.nama || '-',
      'Jenis Kelamin': siswa.jenis_kelamin,
      'Tanggal Lahir': siswa.tanggal_lahir || '-',
      'No HP': siswa.no_hp || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Siswa");
    
    const timestamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `data_siswa_edit_masal_${timestamp}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        nisn: '1234567890',
        nama: 'Ahmad Santoso',
        jenis_kelamin: 'L',
        tanggal_lahir: '2008-05-20',
        no_hp: '08123456789',
        nama_kelas: 'X-IPA-1'
      },
      {
        nisn: '0987654321',
        nama: 'Siti Aminah',
        jenis_kelamin: 'P',
        tanggal_lahir: '2008-11-15',
        no_hp: '08987654321',
        nama_kelas: 'X-IPA-2'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
    
    XLSX.writeFile(wb, 'template_import_siswa_baru.xlsx');
  };

  // Step 1: Read XLSX and Show Preview
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Build map for class lookup
    const classMap = new Map();
    kelasOptions.forEach(k => {
        classMap.set(k.nama.toLowerCase().trim(), k.id);
        classMap.set(k.kode.toLowerCase().trim(), k.id);
    });

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const bstr = e.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsName = wb.SheetNames[0];
            const ws = wb.Sheets[wsName];
            const jsonData = XLSX.utils.sheet_to_json(ws);

            const errorMessages: string[] = [];
            const parsedData = jsonData.map((row: any, index: number) => {
                const rowNum = index + 2; // Assuming header is row 1
                
                // 0. Check ID for Edit Mode
                const systemId = row['SYSTEM_ID (JANGAN UBAH)'] || row['id'] || null;

                // 1. Sanitize Class
                const rawClass = row.nama_kelas || row.kelas || row['Kelas'] || '';
                const classKey = String(rawClass).toLowerCase().trim();
                const foundClassId = classMap.get(classKey) || null;
                
                // 2. Sanitize Mandatory Fields
                // Support both template keys and export keys
                const rawNisn = row.nisn || row['NISN'];
                const nisn = rawNisn ? String(rawNisn).replace(/['"]/g, '').trim() : '';
                
                const rawNama = row.nama || row['Nama Lengkap'];
                const nama = rawNama ? String(rawNama).trim() : '';

                // Validation checks
                if (!nisn) errorMessages.push(`Baris ${rowNum}: NISN kosong.`);
                if (!nama) errorMessages.push(`Baris ${rowNum}: Nama kosong.`);
                
                // 3. Sanitize Optional Fields
                const rawJk = row.jenis_kelamin || row['Jenis Kelamin'];
                const jkStr = rawJk ? String(rawJk).trim().toUpperCase() : 'L';
                const jenis_kelamin = jkStr === 'P' ? 'P' : 'L';
                
                let tanggal_lahir = null;
                const rawTgl = row.tanggal_lahir || row['Tanggal Lahir'];
                if (rawTgl && rawTgl !== '-') {
                    // Check if Excel date number or String
                    if (typeof rawTgl === 'number') {
                        // Excel serial date to JS Date
                        const dateObj = new Date(Math.round((rawTgl - 25569)*86400*1000));
                        tanggal_lahir = dateObj.toISOString().split('T')[0];
                    } else {
                        const dateStr = String(rawTgl).trim();
                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                            tanggal_lahir = dateStr;
                        }
                    }
                }
                
                const rawHp = row.no_hp || row['No HP'];
                const hpStr = rawHp ? String(rawHp).replace(/['"]/g, '').trim() : '';
                const no_hp = hpStr !== '' && hpStr !== '-' ? hpStr : null;

                return {
                    id: systemId, // Important: ID for Update
                    nisn,
                    nama,
                    jenis_kelamin,
                    tanggal_lahir,
                    no_hp,
                    id_kelas: foundClassId,
                    _rawClass: rawClass,
                    _mode: systemId ? 'UPDATE' : 'NEW'
                };
            }).filter((row: any) => row.nisn !== '' && row.nama !== '');

            if (errorMessages.length > 0) {
                const maxErrors = 5;
                const displayErrors = errorMessages.slice(0, maxErrors).join('\n');
                const suffix = errorMessages.length > maxErrors ? `\n...dan ${errorMessages.length - maxErrors} kesalahan lainnya.` : '';
                
                showToast(
                    `Gagal Membaca Excel. Perbaiki data berikut:\n${displayErrors}${suffix}`, 
                    'error', 
                    10000, 
                    'center'
                );
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            if (parsedData.length === 0) {
                showToast('File Excel kosong atau format salah', 'error');
            } else {
                setPreviewData(parsedData);
                setShowPreview(true);
            }
            
            if (fileInputRef.current) fileInputRef.current.value = '';

        } catch (error: any) {
            console.error(error);
            showToast('Gagal membaca file Excel: ' + error.message, 'error', 5000, 'center');
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    reader.readAsBinaryString(file);
  };

  // Step 2: Save Data to DB (Handles both Insert and Update by ID)
  const handleSaveImport = async () => {
    setIsImporting(true);
    setImportProgress(0);
    setShowPreview(false);

    try {
        const total = previewData.length;
        const BATCH_SIZE = 50;
        
        for (let i = 0; i < total; i += BATCH_SIZE) {
            // Extract ONLY columns that exist in DB
            const batch = previewData.slice(i, i + BATCH_SIZE).map(item => {
                const payload: any = {
                    nisn: item.nisn,
                    nama: item.nama,
                    jenis_kelamin: item.jenis_kelamin,
                    tanggal_lahir: item.tanggal_lahir,
                    no_hp: item.no_hp,
                    id_kelas: item.id_kelas
                };
                
                // Jika ID ada (dari CSV export), masukkan ke payload agar Supabase melakukan UPDATE pada row tersebut
                // Jika ID tidak ada, Supabase akan membuat row baru (INSERT)
                if (item.id) {
                    payload.id = item.id;
                }
                
                return payload;
            });

            // Upsert menghandle insert dan update.
            // Jika ID disediakan, dia akan update record dengan ID tersebut.
            // Jika tidak, dia insert. Jika onConflict 'nisn' terjadi pada insert baru, dia update (default behavior upsert)
            // Namun disini kita lebih mengutamakan ID sebagai kunci update.
            const { error } = await supabase.from('siswa').upsert(batch);
            
            if (error) {
                console.error("Batch Import Error:", error);
                throw error;
            }

            const currentProgress = Math.min(Math.round(((i + batch.length) / total) * 100), 100);
            setImportProgress(currentProgress);
        }

        showToast(`Sukses memproses ${total} data siswa`, 'success');
        setPreviewData([]);
        fetchData();
    } catch (error: any) {
        showToast('Gagal menyimpan data ke database: ' + (error.message || 'Unknown error'), 'error', 10000, 'center');
    } finally {
        setIsImporting(false);
        setImportProgress(0);
    }
  };

  // Filter Logic
  const filteredData = data.filter(siswa => {
    const matchesSearch = 
      siswa.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
      siswa.nisn.includes(searchTerm);
    
    const matchesKelas = filterKelas === '' || siswa.id_kelas === filterKelas;

    return matchesSearch && matchesKelas;
  });

  return (
    <div>
      <ConfirmDialog
        isOpen={!!deleteId}
        message="Yakin ingin menghapus siswa ini?"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-white">Manajemen Siswa</h2>
        <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center gap-2 shadow-lg"
              title="Gunakan ini untuk Edit Masal"
            >
              📥 Export & Edit Masal (Excel)
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-500 transition flex items-center gap-2"
              title="Template Kosong untuk Siswa Baru"
            >
              📄 Template Baru
            </button>
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition shadow-lg"
            >
              📂 Import Excel
            </button>
            <button
              onClick={() => openModal()}
              className="bg-primary text-white px-4 py-2 rounded hover:bg-secondary transition shadow-lg"
            >
              + Tambah Siswa
            </button>
        </div>
      </div>

      {/* Import Progress Overlay */}
      {isImporting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-80 md:w-96 text-center">
            <h3 className="text-white font-bold mb-4 text-lg">Memproses Data...</h3>
            <div className="w-full bg-gray-700 rounded-full h-4 mb-2 overflow-hidden">
               <div 
                 className="bg-green-500 h-4 rounded-full transition-all duration-300" 
                 style={{ width: `${importProgress}%` }}
               ></div>
            </div>
            <p className="text-gray-300 font-medium">{importProgress}%</p>
            <p className="text-gray-500 text-sm mt-1">Mohon tunggu sebentar...</p>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-5xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">Preview Import ({previewData.length} Baris)</h3>
                    <div className="flex gap-2 text-sm">
                        <span className="flex items-center gap-1 px-2 py-1 bg-yellow-900/50 text-yellow-200 rounded border border-yellow-700">
                            ✏️ Update: {previewData.filter(d => d._mode === 'UPDATE').length}
                        </span>
                        <span className="flex items-center gap-1 px-2 py-1 bg-green-900/50 text-green-200 rounded border border-green-700">
                            ✨ Baru: {previewData.filter(d => d._mode === 'NEW').length}
                        </span>
                    </div>
                </div>
                
                <div className="flex-1 overflow-auto border border-gray-700 rounded mb-4 custom-scrollbar">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Mode</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">NISN</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Nama</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Kelas (Excel)</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Match DB</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">L/P</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {previewData.slice(0, 100).map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-700">
                                    <td className="px-4 py-2 text-xs">
                                        {row._mode === 'UPDATE' ? (
                                            <span className="text-yellow-400 font-bold">UPDATE</span>
                                        ) : (
                                            <span className="text-green-400 font-bold">BARU</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-300">{row.nisn}</td>
                                    <td className="px-4 py-2 text-sm text-white">{row.nama}</td>
                                    <td className="px-4 py-2 text-sm text-gray-400">{row._rawClass || '-'}</td>
                                    <td className="px-4 py-2 text-sm">
                                        {row.id_kelas ? (
                                            <span className="text-green-400">✅</span>
                                        ) : (
                                            <span className="text-red-400 text-xs">⚠️ Tidak Ditemukan</span>
                                        )}
                                    </td>
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
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold shadow-lg"
                    >
                        💾 Proses Import
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
            placeholder="Cari Nama / NISN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="w-full md:w-64">
           <select
             value={filterKelas}
             onChange={(e) => setFilterKelas(e.target.value)}
             className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-primary"
           >
             <option value="">Semua Kelas</option>
             {kelasOptions.map(k => (
                 <option key={k.id} value={k.id}>{k.nama}</option>
             ))}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nama / NISN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Kelas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">L/P</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Kontak</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {filteredData.map((siswa) => (
                <tr key={siswa.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">{siswa.nama}</div>
                    <div className="text-sm text-gray-400">{siswa.nisn}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {siswa.kelas?.nama || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{siswa.jenis_kelamin}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {siswa.no_hp || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => openModal(siswa)} className="text-indigo-400 hover:text-indigo-300 mr-4">Edit</button>
                    <button onClick={() => handleDeleteClick(siswa.id)} className="text-red-400 hover:text-red-300">Hapus</button>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    Tidak ada data siswa yang cocok.
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
            <h3 className="text-lg font-bold mb-4 text-white">{isEditing ? 'Edit Siswa' : 'Tambah Siswa'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">NISN *</label>
                  <input
                    type="text"
                    required
                    value={formData.nisn || ''}
                    onChange={(e) => setFormData({ ...formData, nisn: e.target.value })}
                    className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm focus:ring-primary focus:border-primary text-white"
                  />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Kelas</label>
                    <select
                        value={formData.id_kelas || ''}
                        onChange={(e) => setFormData({ ...formData, id_kelas: e.target.value })}
                        className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
                    >
                        <option value="">-- Pilih Kelas --</option>
                        {kelasOptions.map(k => (
                            <option key={k.id} value={k.id}>{k.nama}</option>
                        ))}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">Jenis Kelamin</label>
                  <select
                    value={formData.jenis_kelamin || 'L'}
                    onChange={(e) => setFormData({ ...formData, jenis_kelamin: e.target.value as 'L' | 'P' })}
                    className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm text-white"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={formData.tanggal_lahir || ''}
                    onChange={(e) => setFormData({ ...formData, tanggal_lahir: e.target.value })}
                    className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md p-2 shadow-sm text-white"
                  />
                </div>
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