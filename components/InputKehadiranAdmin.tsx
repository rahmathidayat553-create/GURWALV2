
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru, Siswa, Kelas, Kehadiran } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

interface AttendanceFormState {
  [id_siswa: string]: {
    id?: string;
    status: 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPHA' | null;
    catatan: string;
  };
}

interface HolidayInfo {
  jenis: string;
  keterangan: string | null;
}

export const InputKehadiranAdmin: React.FC<Props> = ({ currentUser, showToast }) => {
  const [kelasOptions, setKelasOptions] = useState<Kelas[]>([]);
  const [selectedKelas, setSelectedKelas] = useState<string>('ALL');
  
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  
  const [loadingSiswa, setLoadingSiswa] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [totalStudents, setTotalStudents] = useState(0);

  // Form State
  const [formData, setFormData] = useState<AttendanceFormState>({});
  
  // NEW: Store original DB values for visual check (Saved vs Draft)
  const [originalStatus, setOriginalStatus] = useState<Record<string, string>>({});

  const [isDataSaved, setIsDataSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Validation State
  const [hariSekolah, setHariSekolah] = useState<number>(5);
  const [isHoliday, setIsHoliday] = useState(false);
  const [holidayInfo, setHolidayInfo] = useState<HolidayInfo | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Fetch Class Options & School Settings
  useEffect(() => {
    const fetchInitial = async () => {
      const { data: k } = await supabase.from('kelas').select('*').order('nama');
      if (k) setKelasOptions(k);

      const { data: s } = await supabase.from('sekolah').select('hari_sekolah').limit(1).maybeSingle();
      if (s) setHariSekolah(s.hari_sekolah);
    };
    fetchInitial();
  }, []);

  // 2. Fetch Students when Class, Page, or RowsPerPage changes
  useEffect(() => {
    // Reset page to 1 if class changes (handled in handleClassChange)
    if (selectedKelas) {
      fetchStudents();
    } else {
      setSiswaList([]);
      setTotalStudents(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKelas, currentPage, rowsPerPage]);

  // 3. Check Validity & Fetch Attendance when Date or Student List changes
  useEffect(() => {
    if (siswaList.length > 0 && selectedKelas) {
      validateDateAndFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal, siswaList, hariSekolah]);

  const validateDateAndFetch = async () => {
      // RESET STATE
      setIsHoliday(false);
      setHolidayInfo(null);
      setIsEditing(false); // Reset edit mode on date change
      setOriginalStatus({}); // Clear saved statuses

      // --- VALIDASI 1: TANGGAL MASA DEPAN ---
      if (tanggal > todayStr) {
          setIsHoliday(true);
          setHolidayInfo({ jenis: 'FUTURE_DATE', keterangan: 'Tanggal Masa Depan (Belum dapat diisi)' });
          // Walaupun masa depan, kita coba fetch data (siapa tau ada data aneh masuk)
          await fetchKehadiran(); 
          return;
      }

      // --- VALIDASI 2: HARI SEKOLAH ---
      const dateObj = new Date(tanggal);
      const dayOfWeek = dateObj.getDay(); // 0=Minggu, 6=Sabtu
      
      if (dayOfWeek === 0) {
          setIsHoliday(true);
          setHolidayInfo({ jenis: 'HARI_NON_AKTIF', keterangan: 'Hari Minggu' });
      } else if (hariSekolah === 5 && dayOfWeek === 6) {
          setIsHoliday(true);
          setHolidayInfo({ jenis: 'HARI_NON_AKTIF', keterangan: 'Hari Sabtu (Sekolah 5 Hari Kerja)' });
      }

      // Jika sudah terdeteksi libur sekolah, lanjut fetch kehadiran (mode view only)
      if (dayOfWeek === 0 || (hariSekolah === 5 && dayOfWeek === 6)) {
          await fetchKehadiran();
          return;
      }

      // --- VALIDASI 3: KALENDER PENDIDIKAN ---
      // Cek DB untuk hari libur nasional dll
      const { data: libur } = await supabase
          .from('kalender_pendidikan')
          .select('jenis, keterangan')
          .eq('tanggal', tanggal)
          .maybeSingle();

      if (libur) {
          setIsHoliday(true);
          setHolidayInfo(libur);
      }

      // Akhirnya fetch data kehadiran
      await fetchKehadiran();
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedKelas(e.target.value);
      setCurrentPage(1); // Reset to page 1 on filter change
  };

  const fetchStudents = async () => {
    setLoadingSiswa(true);
    try {
        let query = supabase
          .from('siswa')
          .select('id, nama, nisn, jenis_kelamin, kelas(nama)', { count: 'exact' });

        if (selectedKelas !== 'ALL') {
            // Filter by specific class
            query = query.eq('id_kelas', selectedKelas).order('nama');
        } else {
            // ALL CLASSES -> Apply Pagination
            const from = (currentPage - 1) * rowsPerPage;
            const to = from + rowsPerPage - 1;
            
            query = query
                .order('id_kelas', { ascending: true }) 
                .order('nama', { ascending: true })
                .range(from, to);
        }

        const { data, count, error } = await query;
        
        if (error) throw error;

        // @ts-ignore
        if (data) setSiswaList(data);
        else setSiswaList([]);

        if (count !== null) setTotalStudents(count);

    } catch (error) {
        showToast('Gagal memuat data siswa', 'error');
    } finally {
        setLoadingSiswa(false);
    }
  };

  const fetchKehadiran = async () => {
    try {
        const studentIds = siswaList.map(s => s.id);
        
        // Fetch existing attendance for these students on this date
        const { data } = await supabase
          .from('kehadiran')
          .select('*')
          .in('id_siswa', studentIds)
          .eq('tanggal', tanggal);

        const currentData = data as Kehadiran[] || [];
        const newFormState: AttendanceFormState = {};
        const newOriginalState: Record<string, string> = {};
        const hasData = currentData.length > 0;

        setIsDataSaved(hasData);

        siswaList.forEach(s => {
            const record = currentData.find(k => k.id_siswa === s.id);
            if (record) {
                newFormState[s.id] = {
                    id: record.id,
                    status: record.status,
                    catatan: record.catatan || ''
                };
                newOriginalState[s.id] = record.status; // Simpan snapshot DB
            } else {
                newFormState[s.id] = {
                    status: null, 
                    catatan: ''
                };
            }
        });

        setFormData(newFormState);
        setOriginalStatus(newOriginalState);

    } catch (error) {
        console.error(error);
    }
  };

  const handleRadioChange = (id_siswa: string, value: 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPHA') => {
    if (isHoliday) return; // Prevent change if holiday/future
    setFormData(prev => ({
        ...prev,
        [id_siswa]: { ...prev[id_siswa], status: value }
    }));
  };

  const handleCatatanChange = (id_siswa: string, value: string) => {
    if (isHoliday) return; // Prevent change if holiday/future
    setFormData(prev => ({
        ...prev,
        [id_siswa]: { ...prev[id_siswa], catatan: value }
    }));
  };

  const handleSaveOrUpdate = async () => {
    if (isHoliday) {
        showToast(`Gagal: ${holidayInfo?.keterangan || 'Hari Libur / Masa Depan'}`, 'error');
        return;
    }

    setProcessing(true);
    try {
        // Hanya ambil data yang statusnya dipilih (tidak null)
        const payload = siswaList
            .filter(s => formData[s.id]?.status !== null)
            .map(s => {
                const form = formData[s.id];
                const record: any = {
                    id_guru: currentUser.id, // Admin ID as the recorder
                    id_siswa: s.id,
                    tanggal: tanggal,
                    status: form.status,
                    catatan: form.catatan
                };
                if (form.id) record.id = form.id;
                return record;
            });

        if (payload.length === 0) {
            showToast('⚠️ Tidak ada status kehadiran yang dipilih.', 'error');
            setProcessing(false);
            return;
        }

        const { error } = await supabase.from('kehadiran').upsert(payload);
        if (error) throw error;

        showToast(isDataSaved ? '✅ Data diperbarui' : '✅ Data disimpan', 'success');
        await fetchKehadiran(); // Ini akan mengupdate originalStatus = formData
    } catch (error) {
        showToast('❌ Gagal menyimpan data', 'error');
    } finally {
        setProcessing(false);
    }
  };

  const handleDelete = async () => {
    // Prevent delete on future dates (unless overridden, but logic says block)
    if (tanggal > todayStr) {
        showToast('Tidak dapat menghapus data masa depan.', 'error');
        return;
    }

    setProcessing(true);
    try {
        const studentIds = siswaList.map(s => s.id);
        const { error } = await supabase
            .from('kehadiran')
            .delete()
            .in('id_siswa', studentIds)
            .eq('tanggal', tanggal);

        if (error) throw error;
        showToast('✅ Data dihapus', 'success');
        setShowDeleteConfirm(false);
        await fetchKehadiran();
    } catch (error) {
        showToast('❌ Gagal menghapus', 'error');
    } finally {
        setProcessing(false);
    }
  };

  const RadioOption = ({ id_siswa, val, label, activeColorClass }: any) => {
      const isChecked = formData[id_siswa]?.status === val;
      const dbValue = originalStatus[id_siswa];
      
      // LOGIC VISUAL:
      // Tampilkan Ceklis JIKA (Terpilih) DAN (Nilainya Sama dengan Database)
      // Jika Terpilih tapi Belum Disimpan (berbeda dengan DB atau DB null), tampilkan Label.
      const isSavedMatch = isChecked && (dbValue === val);

      // Disable if: Holiday OR (Data Saved AND Not Editing)
      const isDisabled = isHoliday || (isDataSaved && !isEditing);

      return (
          <label className={`
            cursor-pointer flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg border-2 transition-all select-none
            ${isChecked ? `${activeColorClass} border-transparent text-white shadow-md transform scale-110` : 'border-gray-600 text-gray-400 hover:bg-gray-700 bg-gray-800'}
            ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}>
              <input 
                type="radio" 
                name={`status-${id_siswa}`} 
                value={val}
                checked={isChecked}
                onChange={() => !isDisabled && handleRadioChange(id_siswa, val)}
                className="hidden"
                disabled={isDisabled}
              />
              {/* Logic Ikon Ceklis vs Label Huruf */}
              {isSavedMatch ? (
                  <span className="text-lg md:text-xl font-bold animate-bounce-in">✓</span>
              ) : (
                  <span className="font-bold text-xs md:text-sm">{label}</span>
              )}
          </label>
      );
  };

  // Pagination Logic Helpers
  const totalPages = Math.ceil(totalStudents / rowsPerPage);
  const startRowIndex = (currentPage - 1) * rowsPerPage;

  return (
    <div>
      <ConfirmDialog 
        isOpen={showDeleteConfirm} 
        message={`Hapus data kehadiran siswa yang tampil ini pada tanggal ${tanggal}?`} 
        onConfirm={handleDelete} 
        onCancel={() => setShowDeleteConfirm(false)} 
      />

      <h2 className="text-2xl font-bold text-white mb-6">Input Kehadiran (Admin)</h2>

      {/* Filter Section */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
            <label className="text-gray-300 text-sm block mb-1">Pilih Kelas</label>
            <select
                value={selectedKelas}
                onChange={handleClassChange}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-primary"
            >
                <option value="">-- Pilih Kelas --</option>
                <option value="ALL">🌟 Semua Kelas (Tampilkan Semua Siswa)</option>
                <optgroup label="Kelas Spesifik">
                    {kelasOptions.map(k => (
                        <option key={k.id} value={k.id}>{k.nama}</option>
                    ))}
                </optgroup>
            </select>
        </div>
        <div className="flex-1">
             <label className="text-gray-300 text-sm block mb-1">Tanggal</label>
             <input 
                type="date" 
                value={tanggal}
                max={todayStr} // UI constraint for future dates
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-primary"
             />
        </div>
      </div>

      {/* Alert Block for Holiday/Future */}
      {isHoliday && holidayInfo && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 border ${
            holidayInfo.jenis === 'FUTURE_DATE' 
            ? 'bg-gray-700/50 border-gray-600 text-gray-300' 
            : 'bg-red-900/30 border-red-600/50 text-red-200'
        }`}>
            <span className="text-2xl">{holidayInfo.jenis === 'FUTURE_DATE' ? '⏳' : '🚫'}</span>
            <div>
                <h4 className={`font-bold ${holidayInfo.jenis === 'FUTURE_DATE' ? 'text-gray-200' : 'text-red-100'}`}>
                    {holidayInfo.jenis === 'FUTURE_DATE' ? 'Tanggal Belum Dapat Diisi' : 'Tidak dapat menginput kehadiran'}
                </h4>
                <p className="text-sm">
                    Status: <strong>{holidayInfo.jenis === 'FUTURE_DATE' ? 'Masa Depan' : holidayInfo.jenis.replace(/_/g, ' ')}</strong>.
                    {holidayInfo.keterangan && <span className="block mt-1 italic opacity-80">"{holidayInfo.keterangan}"</span>}
                </p>
            </div>
        </div>
      )}

      {/* Main Content */}
      {!selectedKelas ? (
          <div className="p-10 text-center text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
              Silakan pilih kelas terlebih dahulu.
          </div>
      ) : loadingSiswa ? (
          <div className="p-10 text-center text-gray-400">Memuat data siswa...</div>
      ) : siswaList.length === 0 ? (
          <div className="p-10 text-center text-gray-500 bg-gray-800 rounded-lg">
              Tidak ada siswa ditemukan.
          </div>
      ) : (
          <div className="space-y-4">
               {/* Action Buttons */}
               <div className="flex flex-col md:flex-row justify-between items-center bg-gray-800 p-4 rounded-lg border border-gray-700 sticky top-0 z-10 gap-3">
                   <div className="text-gray-300 text-sm">
                       Total Siswa: <span className="text-white font-bold">{selectedKelas === 'ALL' ? totalStudents : siswaList.length}</span>
                       {selectedKelas === 'ALL' && <span className="text-gray-500 text-xs ml-2">(Menampilkan {siswaList.length} baris)</span>}
                       {isDataSaved && isEditing && <span className="ml-3 px-2 py-1 bg-yellow-600 text-white rounded text-xs font-bold animate-pulse">MODE EDIT</span>}
                   </div>
                   <div className="flex gap-2">
                       {/* BUTTON LOGIC */}
                       {isHoliday ? (
                           <span className="text-red-400 text-sm font-bold italic py-2">Input Dikunci</span>
                       ) : isDataSaved && !isEditing ? (
                           <>
                               <button onClick={() => setIsEditing(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded font-medium shadow-lg text-sm">✏️ Edit</button>
                               <button onClick={() => setShowDeleteConfirm(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium shadow-lg text-sm">🗑️ Hapus</button>
                           </>
                       ) : (
                           <>
                               {isEditing && (
                                   <button onClick={() => { setIsEditing(false); fetchKehadiran(); }} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm">Batal</button>
                               )}
                               <button onClick={handleSaveOrUpdate} disabled={processing} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold shadow-lg disabled:opacity-50 text-sm">
                                   {processing ? 'Menyimpan...' : '💾 Simpan Data'}
                               </button>
                           </>
                       )}
                   </div>
               </div>

               {/* Table */}
               <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
                  <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-700">
                          <thead className="bg-gray-700">
                              <tr>
                                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase w-10">No</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Siswa</th>
                                  {selectedKelas === 'ALL' && (
                                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kelas</th>
                                  )}
                                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase w-20">L/P</th>
                                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Catatan</th>
                              </tr>
                          </thead>
                          <tbody className={`bg-gray-800 divide-y divide-gray-700 ${isHoliday ? 'opacity-60 grayscale-[50%]' : ''}`}>
                              {siswaList.map((s, idx) => {
                                  // Row numbering calculation based on pagination
                                  const rowNumber = selectedKelas === 'ALL' ? startRowIndex + idx + 1 : idx + 1;
                                  
                                  return (
                                  <tr key={s.id} className="hover:bg-gray-750">
                                      <td className="px-6 py-4 text-center text-gray-500 text-sm">{rowNumber}</td>
                                      <td className="px-6 py-4">
                                          <div className="text-sm font-bold text-white">{s.nama}</div>
                                          <div className="text-xs text-gray-400">{s.nisn}</div>
                                      </td>
                                      {selectedKelas === 'ALL' && (
                                         <td className="px-6 py-4 text-sm text-blue-300">
                                             {s.kelas?.nama || '-'}
                                         </td>
                                      )}
                                      <td className="px-6 py-4 text-center text-sm text-gray-300">{s.jenis_kelamin}</td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center justify-center gap-2 md:gap-4">
                                              <RadioOption id_siswa={s.id} val="HADIR" label="H" activeColorClass="bg-green-600" />
                                              <RadioOption id_siswa={s.id} val="IZIN" label="I" activeColorClass="bg-blue-600" />
                                              <RadioOption id_siswa={s.id} val="SAKIT" label="S" activeColorClass="bg-yellow-600" />
                                              <RadioOption id_siswa={s.id} val="ALPHA" label="A" activeColorClass="bg-red-600" />
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <input 
                                              type="text"
                                              value={formData[s.id]?.catatan || ''}
                                              onChange={(e) => handleCatatanChange(s.id, e.target.value)}
                                              disabled={isHoliday || (isDataSaved && !isEditing)}
                                              placeholder={isHoliday ? "Terkunci" : "Ket..."}
                                              className="bg-gray-700 border border-gray-600 text-white text-sm rounded px-3 py-2 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                                          />
                                      </td>
                                  </tr>
                              )})}
                          </tbody>
                      </table>
                  </div>

                  {/* Pagination Controls - Only show if ALL Classes selected */}
                  {selectedKelas === 'ALL' && (
                      <div className="bg-gray-700 px-4 py-3 border-t border-gray-600 flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-300">Tampilkan</span>
                              <select 
                                value={rowsPerPage}
                                onChange={(e) => {
                                    setRowsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="bg-gray-800 border border-gray-500 text-white text-sm rounded px-2 py-1 focus:outline-none"
                              >
                                  <option value={10}>10</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                  <option value={200}>200</option>
                              </select>
                              <span className="text-sm text-gray-300">baris per halaman</span>
                          </div>

                          <div className="flex items-center gap-4">
                              <span className="text-sm text-gray-300">
                                  Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong>
                              </span>
                              <div className="flex gap-1">
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                      &laquo; Prev
                                  </button>
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                      Next &raquo;
                                  </button>
                              </div>
                          </div>
                      </div>
                  )}
               </div>
          </div>
      )}
      
      {/* Legend Footer for Admin */}
      <div className="mt-6 flex flex-wrap gap-4 justify-center text-xs text-gray-400 font-medium bg-gray-800 p-3 rounded-lg border border-gray-700">
         <span className="flex items-center gap-1"><span className="text-white font-bold bg-green-600 px-1.5 rounded">✓</span> Data Tersimpan</span>
         <span className="flex items-center gap-1"><span className="text-white font-bold bg-green-600 px-1.5 rounded">H</span> Belum Disimpan (Draft)</span>
         <div className="w-px h-4 bg-gray-600 mx-2 hidden md:block"></div>
         <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-600"></div> H (Hadir)</span>
         <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500"></div> S (Sakit)</span>
         <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500"></div> I (Izin)</span>
         <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500"></div> A (Alpha)</span>
      </div>
    </div>
  );
};
