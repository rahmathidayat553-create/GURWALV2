import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Guru } from '../../types';
import * as XLSX from 'xlsx';

interface Props {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const ImportKehadiranTemplate: React.FC<Props> = ({ currentUser, showToast }) => {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  
  // State Input
  const [singleDate, setSingleDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hariSekolah, setHariSekolah] = useState<number>(5); // Default 5 hari

  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Constants - Menggunakan Local Time untuk menghindari bug UTC+7
  const getLocalTodayStr = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };
  const todayStr = getLocalTodayStr();

  // --- INITIAL LOAD: Get Hari Sekolah ---
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('sekolah')
        .select('hari_sekolah')
        .limit(1)
        .maybeSingle();
      if (data) {
        setHariSekolah(data.hari_sekolah);
      }
    };
    fetchSettings();
  }, []);

  // --- LOGIC TANGGAL ---

  // 1. Tambah Satu Tanggal dengan Validasi Live
  const handleAddSingleDate = async () => {
    if (!singleDate) return;
    
    // Cek Tanggal Masa Depan
    if (singleDate > todayStr) {
        showToast('Gagal: Tidak dapat memilih tanggal masa depan (besok atau setelahnya).', 'error');
        return;
    }

    // Cek Duplikasi Lokal
    if (selectedDates.includes(singleDate)) {
      showToast('Tanggal sudah ada dalam daftar', 'error');
      return;
    }

    setLoading(true);
    try {
        const dateObj = new Date(singleDate);
        const dayOfWeek = dateObj.getDay(); // 0 = Minggu

        // 1. Cek Akhir Pekan (Lokal)
        if (dayOfWeek === 0) {
            showToast('Gagal: Tanggal yang dipilih adalah hari Minggu.', 'error');
            return;
        }
        if (hariSekolah === 5 && dayOfWeek === 6) {
            showToast('Gagal: Tanggal yang dipilih adalah hari Sabtu (Libur Sekolah).', 'error');
            return;
        }

        // 2. Cek Kalender Pendidikan (Database)
        const { data: libur } = await supabase
            .from('kalender_pendidikan')
            .select('jenis, keterangan')
            .eq('tanggal', singleDate)
            .maybeSingle();

        if (libur) {
            showToast(`Gagal: Tanggal ini libur (${libur.jenis.replace(/_/g, ' ')}). ${libur.keterangan || ''}`, 'error');
            return;
        }

        // Lolos Validasi
        const newDates = [...selectedDates, singleDate].sort();
        setSelectedDates(newDates);
        setSingleDate('');
        showToast('Tanggal berhasil ditambahkan', 'success');

    } catch (error) {
        console.error(error);
        showToast('Terjadi kesalahan saat memvalidasi tanggal', 'error');
    } finally {
        setLoading(false);
    }
  };

  // 2. Tambah Rentang Tanggal dengan Filter Otomatis
  const handleAddRange = async () => {
    if (!startDate || !endDate) {
        showToast('Mohon isi Tanggal Mulai dan Tanggal Akhir', 'error');
        return;
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
        showToast('Tanggal Mulai tidak boleh lebih besar dari Tanggal Akhir', 'error');
        return;
    }

    setLoading(true);
    try {
        // Ambil Data Libur dalam rentang tersebut dari DB
        const { data: holidays } = await supabase
            .from('kalender_pendidikan')
            .select('tanggal, jenis')
            .gte('tanggal', startDate)
            .lte('tanggal', endDate);
        
        const holidayMap = new Set(holidays?.map(h => h.tanggal));

        const validDatesToAdd: string[] = [];
        let skippedCount = 0;
        let skippedReason = '';

        let current = new Date(start);

        // Loop dari start sampai end
        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            const dayOfWeek = current.getDay();

            let isValid = true;

            // Cek Tanggal Masa Depan
            if (dateStr > todayStr) {
                isValid = false;
            }
            // Cek Akhir Pekan
            else if (dayOfWeek === 0 || (hariSekolah === 5 && dayOfWeek === 6)) {
                isValid = false;
            }
            // Cek Kalender Libur
            else if (holidayMap.has(dateStr)) {
                isValid = false;
                skippedReason = 'Hari Libur Nasional/Sekolah';
            }
            // Cek Duplikasi State
            else if (selectedDates.includes(dateStr)) {
                isValid = false; // Sudah ada, skip diam-diam
            }

            if (isValid) {
                validDatesToAdd.push(dateStr);
            } else {
                if (!selectedDates.includes(dateStr)) skippedCount++;
            }

            // Increment hari +1
            current.setDate(current.getDate() + 1);
        }

        if (validDatesToAdd.length === 0) {
            showToast('Tidak ada tanggal yang ditambahkan (Semua tanggal dalam rentang ini libur/masa depan/sudah terpilih).', 'error');
        } else {
            const combinedDates = [...selectedDates, ...validDatesToAdd].sort();
            setSelectedDates(combinedDates);
            setStartDate('');
            setEndDate('');
            
            if (skippedCount > 0) {
                showToast(`Berhasil menambah ${validDatesToAdd.length} tanggal. (${skippedCount} dilewati karena Libur/Masa Depan)`, 'success');
            } else {
                showToast(`Berhasil menambah ${validDatesToAdd.length} tanggal.`, 'success');
            }
        }

    } catch (err) {
        showToast('Gagal memproses rentang tanggal', 'error');
    } finally {
        setLoading(false);
    }
  };

  const handleRemoveDate = (dateToRemove: string) => {
    setSelectedDates(selectedDates.filter(d => d !== dateToRemove));
  };

  const handleClearDates = () => {
      setSelectedDates([]);
  };

  // --- LOGIC GENERATE & IMPORT ---

  const handleGenerateTemplate = async () => {
    if (selectedDates.length === 0) {
      showToast('Pilih minimal satu tanggal terlebih dahulu', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. Ambil data siswa
      const { data: siswaData, error } = await supabase
        .from('bimbingan')
        .select('*, siswa(id, nama, nisn, kelas(nama))')
        .eq('id_guru', currentUser.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!siswaData || siswaData.length === 0) {
        showToast('Anda belum memiliki siswa binaan', 'error');
        setLoading(false);
        return;
      }

      // 2. AMBIL DATA KEHADIRAN EXISTING (Fitur Baru)
      // Kita ambil data kehadiran yang sudah ada di DB untuk tanggal-tanggal yang dipilih
      const { data: existingAttendance } = await supabase
        .from('kehadiran')
        .select('id_siswa, tanggal, status')
        .eq('id_guru', currentUser.id)
        .in('tanggal', selectedDates);

      // Buat Map: "ID_SISWA_TANGGAL" -> "KODE STATUS"
      const attendanceMap = new Map<string, string>();
      existingAttendance?.forEach((rec: any) => {
          const key = `${rec.id_siswa}_${rec.tanggal}`;
          let code = '';
          if (rec.status === 'HADIR') code = 'H';
          else if (rec.status === 'SAKIT') code = 'S';
          else if (rec.status === 'IZIN') code = 'I';
          else if (rec.status === 'ALPHA') code = 'A';
          attendanceMap.set(key, code);
      });

      // 3. Generate Rows dengan Data Existing
      const rows = siswaData.map((item, index) => {
        const row: any = {
          NO: index + 1,
          NISN: item.siswa?.nisn ? `'${item.siswa.nisn}` : '', // Force text format
          NAMA: item.siswa?.nama || '',
          KELAS: item.siswa?.kelas?.nama || '',
        };
        
        // Loop setiap tanggal, isi dengan data existing jika ada
        selectedDates.forEach(date => {
          const key = `${item.id_siswa}_${date}`;
          // Jika ada data di DB, isi kodenya. Jika tidak, kosongkan.
          row[date] = attendanceMap.get(key) || ''; 
        });
        
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Kehadiran");

      const filename = `Template_Kehadiran_Custom_${getLocalTodayStr()}.xlsx`;
      XLSX.writeFile(wb, filename);

      showToast('Template berhasil didownload! Data kehadiran lama sudah terisi otomatis.', 'success');

    } catch (err: any) {
      console.error(err);
      showToast('Gagal membuat template: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setImportProgress(0); 
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          showToast('File Excel kosong', 'error');
          setLoading(false);
          return;
        }

        // --- VALIDASI HEADER TANGGAL SEBELUM IMPORT ---
        const firstRow = data[0] as any;
        const keys = Object.keys(firstRow);
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const dateColumns = keys.filter(k => dateRegex.test(k));

        if (dateColumns.length > 0) {
            // 1. Validasi Tanggal Masa Depan
            const futureDates = dateColumns.filter(d => d > todayStr);
            if (futureDates.length > 0) {
                showToast(`GAGAL IMPORT! File mengandung tanggal masa depan: ${futureDates.join(', ')}.`, 'error');
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            // 2. Validasi Hari Libur (Weekend) sesuai pengaturan sekolah
            const invalidSchoolDays = dateColumns.filter(d => {
                const day = new Date(d).getDay();
                if (day === 0) return true; // Minggu
                if (hariSekolah === 5 && day === 6) return true; // Sabtu
                return false;
            });

            if (invalidSchoolDays.length > 0) {
                showToast(`GAGAL IMPORT! File mengandung tanggal libur sekolah (Sabtu/Minggu): ${invalidSchoolDays.join(', ')}`, 'error');
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            // 3. Cek apakah ada tanggal libur (Kalender Pendidikan) di kolom Excel
            const { data: holidays } = await supabase
                .from('kalender_pendidikan')
                .select('tanggal, jenis')
                .in('tanggal', dateColumns);
            
            if (holidays && holidays.length > 0) {
                const holidayDates = holidays.map(h => `${h.tanggal} (${h.jenis})`).join(', ');
                showToast(`GAGAL IMPORT! File mengandung tanggal libur nasional: ${holidayDates}.`, 'error');
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
        }
        // ----------------------------------------------

        let processedCount = 0;
        let errorCount = 0;
        const totalRows = data.length;

        for (let i = 0; i < totalRows; i++) {
          const row: any = data[i];
          const nisn = row['NISN'] ? String(row['NISN']).replace(/['"]/g, '').trim() : '';
          const nama = row['NAMA'] ? String(row['NAMA']).trim() : '';

          if (!nisn && !nama) {
             const currentProgress = Math.round(((i + 1) / totalRows) * 100);
             setImportProgress(currentProgress);
             continue; 
          }

          let studentId = '';
          const { data: foundSiswa } = await supabase
             .from('siswa')
             .select('id')
             .eq('nisn', nisn)
             .maybeSingle();
             
          if (foundSiswa) {
            studentId = foundSiswa.id;
          } else {
            // Fallback cari by nama
            const { data: foundSiswaByName } = await supabase
                .from('siswa')
                .select('id')
                .ilike('nama', nama)
                .maybeSingle();
            if (foundSiswaByName) studentId = foundSiswaByName.id;
          }

          if (!studentId) {
            errorCount++;
          } else {
            for (const key of keys) {
               if (dateRegex.test(key)) {
                  const rawStatus = row[key] ? String(row[key]).trim().toUpperCase() : '';
                  let statusDb: 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPHA' | null = null;

                  if (['H', 'HADIR'].includes(rawStatus)) statusDb = 'HADIR';
                  else if (['S', 'SAKIT'].includes(rawStatus)) statusDb = 'SAKIT';
                  else if (['I', 'IZIN'].includes(rawStatus)) statusDb = 'IZIN';
                  else if (['A', 'ALPHA', 'ALPA'].includes(rawStatus)) statusDb = 'ALPHA';

                  if (statusDb) {
                      // UPSERT Logic: Update jika ada, Insert jika baru
                      // Kita gunakan manual upsert flow untuk keamanan logika
                      const { data: existingRecord } = await supabase
                          .from('kehadiran')
                          .select('id')
                          .eq('id_guru', currentUser.id)
                          .eq('id_siswa', studentId)
                          .eq('tanggal', key)
                          .maybeSingle();

                      if (existingRecord) {
                          // Update Existing
                          await supabase
                              .from('kehadiran')
                              .update({ status: statusDb })
                              .eq('id', existingRecord.id);
                      } else {
                          // Insert New
                          await supabase
                              .from('kehadiran')
                              .insert([{
                                  id_guru: currentUser.id,
                                  id_siswa: studentId,
                                  tanggal: key,
                                  status: statusDb
                              }]);
                      }
                  }
               }
            }
            processedCount++;
          }

          const currentProgress = Math.round(((i + 1) / totalRows) * 100);
          setImportProgress(currentProgress);
        }

        showToast(`Import selesai. ${processedCount} siswa diproses.`, 'success');
        if (errorCount > 0) {
            setTimeout(() => showToast(`${errorCount} siswa tidak ditemukan di database.`, 'error'), 2000);
        }

      } catch (err: any) {
        console.error(err);
        showToast('Gagal memproses file: ' + err.message, 'error');
      } finally {
        setLoading(false);
        setImportProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-3xl font-bold text-white mb-2">Import Kehadiran (Custom)</h2>
      <p className="text-gray-400 mb-8">
        Fitur ini memungkinkan Anda mengisi absensi untuk beberapa tanggal sekaligus menggunakan Excel.
        <br />
        <span className="text-green-400 text-xs block mt-1">
            * Template yang didownload akan <strong>otomatis berisi data kehadiran yang sudah ada</strong> (jika ada), sehingga Anda tidak perlu khawatir menimpa data yang sudah benar dengan data kosong.
        </span>
      </p>

      {/* STEP 1: PILIH TANGGAL */}
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg mb-6">
        <h3 className="text-lg font-semibold text-blue-400 mb-4">1. Pilih Tanggal & Buat Template</h3>
        
        <div className="space-y-6">
            
            {/* OPSI A: Tambah Rentang (Multiselect Logic) */}
            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                <label className="block text-sm font-bold text-white mb-3">🅰️ Opsi Cepat: Pilih Rentang Tanggal</label>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="text-xs text-gray-400 block mb-1">Dari Tanggal</label>
                        <input 
                            type="date" 
                            max={todayStr}
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-gray-700 border border-gray-500 text-white rounded px-3 py-2 w-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex items-center justify-center pb-2 text-gray-400">
                        ➡️
                    </div>
                    <div className="flex-1 w-full">
                        <label className="text-xs text-gray-400 block mb-1">Sampai Tanggal</label>
                        <input 
                            type="date" 
                            max={todayStr}
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-gray-700 border border-gray-500 text-white rounded px-3 py-2 w-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <button 
                        onClick={handleAddRange}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition w-full md:w-auto h-[42px] disabled:opacity-50"
                    >
                        {loading ? 'Memvalidasi...' : '+ Tambahkan Rentang'}
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    * Tanggal libur/akhir pekan di antara rentang ini akan otomatis dilewati.
                </p>
            </div>

            {/* OPSI B: Tambah Manual */}
            <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600 border-dashed">
                <label className="block text-sm font-bold text-gray-300 mb-3">🅱️ Opsi Manual: Tambah Satuan</label>
                <div className="flex flex-col md:flex-row gap-4">
                    <input 
                        type="date" 
                        max={todayStr}
                        value={singleDate}
                        onChange={(e) => setSingleDate(e.target.value)}
                        className="bg-gray-700 border border-gray-500 text-white rounded px-3 py-2 w-full md:w-64"
                    />
                    <button 
                        onClick={handleAddSingleDate}
                        disabled={loading}
                        className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded font-medium transition w-full md:w-auto disabled:opacity-50"
                    >
                        {loading ? 'Cek...' : '+ Tambah'}
                    </button>
                </div>
            </div>

            {/* Selected Dates Chips */}
            {selectedDates.length > 0 && (
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-gray-300">Daftar Tanggal Terpilih ({selectedDates.length}):</span>
                        <button onClick={handleClearDates} className="text-xs text-red-400 hover:text-red-300 underline">Hapus Semua</button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {selectedDates.map(date => (
                            <div key={date} className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm flex items-center gap-2 border border-primary/30">
                                <span>🗓️ {date}</span>
                                <button 
                                    onClick={() => handleRemoveDate(date)}
                                    className="text-red-400 hover:text-red-300 font-bold px-1 hover:bg-white/10 rounded"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="border-t border-gray-700 pt-4">
                <button 
                    onClick={handleGenerateTemplate}
                    disabled={loading || selectedDates.length === 0}
                    className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Mengambil Data Existing...' : '📥 Generate & Download Template (Isi Data Existing)'}
                </button>
            </div>
        </div>
      </div>

      {/* STEP 2: UPLOAD */}
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
        <h3 className="text-lg font-semibold text-green-400 mb-4">2. Upload & Import Data</h3>
        <p className="text-sm text-gray-400 mb-4">
            Isi file Excel yang telah diunduh dengan kode: <strong>H</strong> (Hadir), <strong>S</strong> (Sakit), <strong>I</strong> (Izin), <strong>A</strong> (Alpha).
        </p>
        
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-10 bg-gray-700/30 hover:bg-gray-700/50 transition relative">
            <input 
                type="file" 
                accept=".xlsx, .xls"
                ref={fileInputRef}
                onChange={handleFileUpload}
                disabled={loading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                id="file-upload"
            />
            <div className="text-center pointer-events-none">
                <span className="text-4xl mb-2 block">📂</span>
                <span className="text-white font-medium mb-1 block">Klik atau Seret File Excel ke Sini</span>
                <span className="text-xs text-gray-500 block">Format .xlsx atau .xls</span>
            </div>
        </div>
      </div>

      {/* PROGRESS OVERLAY */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-80 md:w-96 text-center">
            <h3 className="text-white font-bold mb-4 text-lg">Memproses Data...</h3>
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

    </div>
  );
};
