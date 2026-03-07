
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Guru, Siswa, Kelas, Mapel, Nilai, Pengajaran } from '../../types';

interface Props {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

// Tipe untuk menampung nilai sementara sebelum disimpan
interface LocalGradeState {
  [studentId: string]: string; // Kita simpan sebagai string di UI agar bisa handle input kosong
}

export const InputNilai: React.FC<Props> = ({ currentUser, showToast }) => {
  // --- STATE ALUR (STEPPER) ---
  const [step, setStep] = useState<number>(1);

  // --- STATE DATA MASTER ---
  const [allPengajaran, setAllPengajaran] = useState<Pengajaran[]>([]);
  const [inputtedGrades, setInputtedGrades] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{kelas: string, mapel: string, jenis: string, materi: string} | null>(null);
  
  // --- STATE SELECTION ---
  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [selectedMapel, setSelectedMapel] = useState<string>('');
  const [selectedJenis, setSelectedJenis] = useState<'FORMATIF' | 'SUMATIF' | 'AKHIR_SUMATIF' | ''>('');
  const [inputMateri, setInputMateri] = useState<string>('');

  // --- STATE DATA SISWA & NILAI ---
  const [students, setStudents] = useState<Siswa[]>([]);
  const [localGrades, setLocalGrades] = useState<LocalGradeState>({});
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1. Load Data Pengajaran & History (Sekali saat mount)
  useEffect(() => {
    const fetchInitial = async () => {
      setLoadingHistory(true);
      const { data: assignments } = await supabase
        .from('pengajaran')
        .select('*, kelas(*), mapel(*)')
        .eq('id_guru', currentUser.id);

      if (assignments) {
        setAllPengajaran(assignments as unknown as Pengajaran[]);
      }

      await fetchInputtedGrades();
      setLoadingHistory(false);
    };
    fetchInitial();
  }, [currentUser.id]);

  const fetchInputtedGrades = async () => {
    // Ambil data unik dari tabel nilai untuk guru ini
    // Kita butuh: id_kelas (via siswa), id_mapel, jenis, materi
    // Karena id_kelas ada di tabel siswa, kita join
    const { data, error } = await supabase
      .from('nilai')
      .select(`
        id_mapel, 
        jenis, 
        materi,
        mapel:id_mapel(nama),
        siswa:id_siswa(id_kelas, kelas:id_kelas(nama))
      `)
      .eq('id_guru', currentUser.id);

    if (error) {
      console.error(error);
      return;
    }

    // Grouping untuk mendapatkan list unik
    const uniqueMap = new Map<string, any>();
    data?.forEach((item: any) => {
      const kelasId = item.siswa?.id_kelas;
      const kelasNama = item.siswa?.kelas?.nama;
      const mapelId = item.id_mapel;
      const mapelNama = item.mapel?.nama;
      const jenis = item.jenis;
      const materi = item.materi || '';

      const key = `${kelasId}-${mapelId}-${jenis}-${materi}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          kelasId,
          kelasNama,
          mapelId,
          mapelNama,
          jenis,
          materi,
          count: 1
        });
      } else {
        uniqueMap.get(key).count += 1;
      }
    });

    setInputtedGrades(Array.from(uniqueMap.values()));
  };

  // --- DERIVED OPTIONS (Filter dropdown berdasarkan step sebelumnya) ---
  
  // Ambil opsi kelas unik dari data pengajaran
  const kelasOptions: Kelas[] = [];
  const kelasMap = new Map<string, Kelas>();
  allPengajaran.forEach(item => {
    if (item.kelas) {
      kelasMap.set(item.id_kelas, item.kelas);
    }
  });
  kelasMap.forEach(value => kelasOptions.push(value));

  // Ambil opsi mapel berdasarkan kelas yang dipilih
  const mapelOptions = allPengajaran
    .filter(item => item.id_kelas === selectedKelas && item.mapel)
    .map(item => item.mapel!);

  // Helper untuk mendapatkan nama (label) untuk review
  const getKelasName = () => kelasOptions.find(k => k.id === selectedKelas)?.nama || '-';
  const getMapelName = () => mapelOptions.find(m => m.id === selectedMapel)?.nama || '-';

  // --- HANDLERS ALUR ---

  const handleNextStep = () => {
      if (step === 1 && !selectedKelas) return showToast('Pilih Kelas terlebih dahulu', 'error');
      if (step === 2 && !selectedMapel) return showToast('Pilih Mata Pelajaran terlebih dahulu', 'error');
      if (step === 3 && !selectedJenis) return showToast('Pilih Jenis Nilai terlebih dahulu', 'error');
      
      if (step === 4) {
          // Saat mau masuk ke step 5 (Tabel), kita load data siswa & nilai yang sudah ada
          if(!inputMateri) {
             // Optional: Boleh kosong atau wajib? Asumsikan boleh kosong tapi warning
             // showToast('Materi sebaiknya diisi', 'warning'); 
          }
          fetchStudentsAndGrades();
      } else {
          setStep(prev => prev + 1);
      }
  };

  const handleBackStep = () => {
      setStep(prev => prev - 1);
  };

  const handleReset = () => {
      setStep(1);
      setSelectedKelas('');
      setSelectedMapel('');
      setSelectedJenis('');
      setInputMateri('');
      setLocalGrades({});
      setStudents([]);
  };

  // --- LOGIC FETCH DATA (STEP 4 -> 5) ---
  const fetchStudentsAndGrades = async () => {
      setLoading(true);
      try {
          // 1. Ambil Siswa
          const { data: studentsData } = await supabase
            .from('siswa')
            .select('*')
            .eq('id_kelas', selectedKelas)
            .order('nama');
          
          if (!studentsData) throw new Error("Gagal memuat siswa");
          setStudents(studentsData);

          // 2. Ambil Nilai Existing (Sesuai Kelas, Mapel, Jenis, Materi)
          let query = supabase
            .from('nilai')
            .select('*')
            .eq('id_guru', currentUser.id)
            .eq('id_mapel', selectedMapel)
            .eq('jenis', selectedJenis)
            .in('id_siswa', studentsData.map(s => s.id));

          if (inputMateri) {
            query = query.eq('materi', inputMateri);
          } else {
            query = query.is('materi', null);
          }

          const { data: gradesData } = await query;

          // 3. Map ke Local State
          const initialGrades: LocalGradeState = {};
          
          studentsData.forEach(s => {
              const record = gradesData?.find(g => g.id_siswa === s.id);
              if (record) {
                  initialGrades[s.id] = String(record.nilai);
              } else {
                  initialGrades[s.id] = '';
              }
          });

          setLocalGrades(initialGrades);
          setStep(5); // Pindah ke tabel

      } catch (error) {
          showToast('Gagal memuat data.', 'error');
      } finally {
          setLoading(false);
      }
  };

  // --- HANDLER INPUT NILAI ---
  const handleInputChange = (studentId: string, val: string) => {
      setLocalGrades(prev => ({
          ...prev,
          [studentId]: val
      }));
  };

  // --- HANDLER SIMPAN ---
  const handleSaveAll = async () => {
      setSaving(true);
      try {
          // ... existing logic ...
          // (I will keep the existing logic but wrap it better if needed)
          // Actually, the existing logic is quite verbose with per-student queries.
          // Let's optimize it slightly to use a bulk approach if possible, 
          // but for now, I'll just ensure fetchInputtedGrades is called after.
          
          const today = new Date().toISOString().split('T')[0];

          for (const student of students) {
              const valStr = localGrades[student.id];
              const numVal = valStr === '' ? null : parseFloat(valStr);
              
              if (numVal !== null && (numVal < 0 || numVal > 100)) {
                  throw new Error(`Nilai untuk ${student.nama} tidak valid (0-100)`);
              }

              let query = supabase
                .from('nilai')
                .select('id')
                .eq('id_guru', currentUser.id)
                .eq('id_siswa', student.id)
                .eq('id_mapel', selectedMapel)
                .eq('jenis', selectedJenis);

              if (inputMateri) {
                query = query.eq('materi', inputMateri);
              } else {
                query = query.is('materi', null);
              }

              const { data: existing } = await query.maybeSingle();

              const materiToSave = inputMateri || null;

              if (numVal !== null) {
                  if (existing) {
                      await supabase.from('nilai').update({
                          nilai: numVal,
                          materi: materiToSave,
                          tanggal: today
                      }).eq('id', existing.id);
                  } else {
                      await supabase.from('nilai').insert([{
                          id_guru: currentUser.id,
                          id_siswa: student.id,
                          id_mapel: selectedMapel,
                          jenis: selectedJenis,
                          nilai: numVal,
                          materi: materiToSave,
                          tanggal: today
                      }]);
                  }
              } else {
                  if (existing) {
                      await supabase.from('nilai').delete().eq('id', existing.id);
                  }
              }
          }

          showToast('✅ Semua nilai berhasil disimpan!', 'success');
          await fetchInputtedGrades();
      } catch (error: any) {
          console.error(error);
          showToast(error.message || 'Gagal menyimpan nilai', 'error');
      } finally {
          setSaving(false);
      }
  };

  const handleEditHistory = (item: any) => {
    setSelectedKelas(item.kelasId);
    setSelectedMapel(item.mapelId);
    setSelectedJenis(item.jenis);
    setInputMateri(item.materi);
    
    // Langsung fetch data siswa & nilai untuk step 5
    // Kita butuh fetchStudentsAndGrades tapi dengan parameter atau state yang sudah diupdate
    // Karena setState async, kita panggil fetch manual dengan data item
    fetchStudentsAndGradesManual(item.kelasId, item.mapelId, item.jenis, item.materi);
  };

  const fetchStudentsAndGradesManual = async (kelasId: string, mapelId: string, jenis: string, materi: string) => {
    setLoading(true);
    try {
        const { data: studentsData } = await supabase
          .from('siswa')
          .select('*')
          .eq('id_kelas', kelasId)
          .order('nama');
        
        if (!studentsData) throw new Error("Gagal memuat siswa");
        setStudents(studentsData);

        let query = supabase
          .from('nilai')
          .select('*')
          .eq('id_guru', currentUser.id)
          .eq('id_mapel', mapelId)
          .eq('jenis', jenis)
          .in('id_siswa', studentsData.map(s => s.id));

        if (materi) {
          query = query.eq('materi', materi);
        } else {
          query = query.is('materi', null);
        }

        const { data: gradesData } = await query;

        const initialGrades: LocalGradeState = {};
        studentsData.forEach(s => {
            const record = gradesData?.find(g => g.id_siswa === s.id);
            initialGrades[s.id] = record ? String(record.nilai) : '';
        });

        setLocalGrades(initialGrades);
        setStep(5);
    } catch (error) {
        showToast('Gagal memuat data.', 'error');
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteHistory = async () => {
    if (!showDeleteConfirm) return;
    const { kelasId, mapelId, jenis, materi } = showDeleteConfirm as any;
    
    setLoadingHistory(true);
    try {
      // Kita harus hapus nilai berdasarkan kriteria ini
      // Karena id_kelas tidak ada di tabel nilai, kita harus cari id_siswa dulu
      const { data: studentsInClass } = await supabase
        .from('siswa')
        .select('id')
        .eq('id_kelas', kelasId);
      
      if (studentsInClass && studentsInClass.length > 0) {
        const studentIds = studentsInClass.map(s => s.id);
        
        let query = supabase
          .from('nilai')
          .delete()
          .eq('id_guru', currentUser.id)
          .eq('id_mapel', mapelId)
          .eq('jenis', jenis)
          .in('id_siswa', studentIds);

        if (materi) {
          query = query.eq('materi', materi);
        } else {
          query = query.is('materi', null);
        }

        const { error } = await query;

        if (error) throw error;
        showToast('✅ Daftar nilai berhasil dihapus', 'success');
        await fetchInputtedGrades();
      }
    } catch (error) {
      showToast('Gagal menghapus data', 'error');
    } finally {
      setLoadingHistory(false);
      setShowDeleteConfirm(null);
    }
  };

  // --- RENDER STEPS ---

  // STEP 1: PILIH KELAS
  if (step === 1) {
      return (
          <div className="max-w-4xl mx-auto mt-10 space-y-10">
              <div className="max-w-2xl mx-auto">
                  <h2 className="text-2xl font-bold text-white mb-6 text-center">Langkah 1: Pilih Kelas</h2>
                  <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-lg">
                      <label className="block text-gray-400 mb-2 font-medium">Daftar Kelas Ajar Anda</label>
                      <select 
                        value={selectedKelas}
                        onChange={(e) => setSelectedKelas(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white text-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                      >
                          <option value="">-- Pilih Kelas --</option>
                          {kelasOptions.map((k) => (
                              <option key={k.id} value={k.id}>{k.nama}</option>
                          ))}
                      </select>
                      
                      <div className="mt-8 flex justify-end">
                          <button 
                            onClick={handleNextStep}
                            className="bg-primary hover:bg-secondary text-white px-8 py-3 rounded-lg font-bold shadow-lg transition transform hover:scale-105"
                          >
                              Lanjutkan ➡️
                          </button>
                      </div>
                  </div>
              </div>

              {/* DAFTAR NILAI TERINPUT */}
              <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <span>📋</span> Daftar Nilai Terinput
                  </h3>
                  
                  {loadingHistory ? (
                      <div className="p-10 text-center text-gray-500">Memuat riwayat...</div>
                  ) : inputtedGrades.length === 0 ? (
                      <div className="p-10 text-center text-gray-500 italic border-2 border-dashed border-gray-700 rounded-lg">
                          Belum ada nilai yang diinput.
                      </div>
                  ) : (
                      <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-700">
                              <thead className="bg-gray-750">
                                  <tr>
                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Kelas</th>
                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Mapel</th>
                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Jenis</th>
                                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Materi</th>
                                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase">Siswa</th>
                                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase">Aksi</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700">
                                  {inputtedGrades.map((item, idx) => (
                                      <tr key={idx} className="hover:bg-gray-750 transition-colors">
                                          <td className="px-4 py-3 text-sm text-white font-medium">{item.kelasNama}</td>
                                          <td className="px-4 py-3 text-sm text-gray-300">{item.mapelNama}</td>
                                          <td className="px-4 py-3 text-sm">
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                  item.jenis === 'FORMATIF' ? 'bg-green-900/30 text-green-400 border border-green-800' :
                                                  item.jenis === 'SUMATIF' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                                                  'bg-purple-900/30 text-purple-400 border border-purple-800'
                                              }`}>
                                                  {item.jenis}
                                              </span>
                                          </td>
                                          <td className="px-4 py-3 text-sm text-gray-400 italic truncate max-w-[150px]">
                                              {item.materi || '-'}
                                          </td>
                                          <td className="px-4 py-3 text-center text-sm text-gray-300">
                                              {item.count}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                              <div className="flex justify-center gap-2">
                                                  <button 
                                                    onClick={() => handleEditHistory(item)}
                                                    className="p-1.5 bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600 hover:text-white rounded transition"
                                                    title="Edit Nilai"
                                                  >
                                                      ✏️
                                                  </button>
                                                  <button 
                                                    onClick={() => setShowDeleteConfirm(item)}
                                                    className="p-1.5 bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white rounded transition"
                                                    title="Hapus Nilai"
                                                  >
                                                      🗑️
                                                  </button>
                                              </div>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>

              {/* MODAL KONFIRMASI HAPUS */}
              {showDeleteConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl animate-bounce-in">
                          <h3 className="text-xl font-bold text-white mb-2">Konfirmasi Hapus</h3>
                          <p className="text-gray-400 mb-6">
                              Apakah Anda yakin ingin menghapus seluruh daftar nilai untuk materi <strong className="text-white">"{showDeleteConfirm.materi || '-'}"</strong> di kelas <strong className="text-white">{showDeleteConfirm.kelasNama}</strong>?
                              <br/><br/>
                              <span className="text-red-400 text-xs italic">* Tindakan ini tidak dapat dibatalkan.</span>
                          </p>
                          <div className="flex justify-end gap-3">
                              <button 
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                              >
                                  Batal
                              </button>
                              <button 
                                onClick={handleDeleteHistory}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg transition"
                              >
                                  Ya, Hapus
                              </button>
                          </div>
                      </div>
                  </div>
              )}
          </div>
      );
  }

  // STEP 2: PILIH MAPEL
  if (step === 2) {
      return (
          <div className="max-w-2xl mx-auto mt-10">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">Langkah 2: Pilih Mata Pelajaran</h2>
              <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-lg">
                  <div className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                      <span className="text-gray-400 text-sm block">Kelas Terpilih:</span>
                      <span className="text-white font-bold text-lg">{getKelasName()}</span>
                  </div>

                  <label className="block text-gray-400 mb-2 font-medium">Mata Pelajaran di Kelas Ini</label>
                  <select 
                    value={selectedMapel}
                    onChange={(e) => setSelectedMapel(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white text-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                  >
                      <option value="">-- Pilih Mapel --</option>
                      {mapelOptions.map((m) => (
                          <option key={m.id} value={m.id}>{m.nama} ({m.kode})</option>
                      ))}
                  </select>
                  
                  <div className="mt-8 flex justify-between">
                      <button 
                        onClick={handleBackStep}
                        className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-3 rounded-lg font-medium transition"
                      >
                          ⬅️ Kembali
                      </button>
                      <button 
                        onClick={handleNextStep}
                        className="bg-primary hover:bg-secondary text-white px-8 py-3 rounded-lg font-bold shadow-lg transition transform hover:scale-105"
                      >
                          Lanjutkan ➡️
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // STEP 3: PILIH JENIS NILAI
  if (step === 3) {
      return (
          <div className="max-w-2xl mx-auto mt-10">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">Langkah 3: Jenis Penilaian</h2>
              <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-lg">
                  <div className="mb-6 flex gap-4 text-sm">
                      <div className="bg-gray-700/50 px-3 py-1 rounded border border-gray-600 text-gray-300">
                          Kelas: <strong className="text-white">{getKelasName()}</strong>
                      </div>
                      <div className="bg-gray-700/50 px-3 py-1 rounded border border-gray-600 text-gray-300">
                          Mapel: <strong className="text-white">{getMapelName()}</strong>
                      </div>
                  </div>

                  <label className="block text-gray-400 mb-4 font-medium">Pilih Kategori Nilai</label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                          { id: 'FORMATIF', label: 'Formatif', desc: 'Tugas, Kuis, Harian' },
                          { id: 'SUMATIF', label: 'Sumatif', desc: 'UTS, Bab, Lingkup Materi' },
                          { id: 'AKHIR_SUMATIF', label: 'Akhir Sumatif', desc: 'UAS, PAS, UKK' }
                      ].map((opt) => (
                          <div 
                            key={opt.id}
                            onClick={() => setSelectedJenis(opt.id as any)}
                            className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${
                                selectedJenis === opt.id 
                                ? 'border-primary bg-primary/20 shadow-md transform scale-105' 
                                : 'border-gray-600 bg-gray-700 hover:bg-gray-600 hover:border-gray-500'
                            }`}
                          >
                              <div className="flex flex-col items-center text-center h-full justify-center">
                                  <span className={`text-lg font-bold ${selectedJenis === opt.id ? 'text-white' : 'text-gray-200'}`}>
                                      {opt.label}
                                  </span>
                                  <span className="text-xs text-gray-400 mt-2">{opt.desc}</span>
                              </div>
                          </div>
                      ))}
                  </div>
                  
                  <div className="mt-8 flex justify-between">
                      <button onClick={handleBackStep} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-3 rounded-lg font-medium transition">
                          ⬅️ Kembali
                      </button>
                      <button onClick={handleNextStep} className="bg-primary hover:bg-secondary text-white px-8 py-3 rounded-lg font-bold shadow-lg transition">
                          Lanjutkan ➡️
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // STEP 4: ISI MATERI
  if (step === 4) {
      return (
          <div className="max-w-2xl mx-auto mt-10">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">Langkah 4: Topik / Materi</h2>
              <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-lg">
                  <div className="mb-6 flex flex-wrap gap-2 text-sm">
                      <span className="bg-gray-700/50 px-2 py-1 rounded border border-gray-600 text-gray-300">
                          {getKelasName()}
                      </span>
                      <span className="bg-gray-700/50 px-2 py-1 rounded border border-gray-600 text-gray-300">
                          {getMapelName()}
                      </span>
                      <span className="bg-blue-900/50 px-2 py-1 rounded border border-blue-800 text-blue-200 font-bold">
                          {selectedJenis}
                      </span>
                  </div>

                  <label className="block text-gray-400 mb-2 font-medium">Judul Materi / Kompetensi Dasar</label>
                  <input 
                    type="text"
                    value={inputMateri}
                    onChange={(e) => setInputMateri(e.target.value)}
                    placeholder="Contoh: Aljabar Linear / Bab 1 Makhluk Hidup"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white text-lg focus:ring-2 focus:ring-primary focus:border-transparent transition placeholder-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                      * Materi ini akan disimpan bersama nilai siswa sebagai referensi.
                  </p>
                  
                  <div className="mt-8 flex justify-between">
                      <button onClick={handleBackStep} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-3 rounded-lg font-medium transition">
                          ⬅️ Kembali
                      </button>
                      <button onClick={handleNextStep} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition transform hover:scale-105 flex items-center gap-2">
                          <span>📝</span> Mulai Input Nilai
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // STEP 5: TABEL INPUT (FINAL)
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header Info Bar */}
      <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg mb-6 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20">
          <div className="flex flex-col">
              <h2 className="text-xl font-bold text-white">Input Nilai Siswa</h2>
              <div className="flex gap-2 text-xs mt-1 text-gray-400">
                  <span>{getKelasName()}</span> • 
                  <span>{getMapelName()}</span> • 
                  <span className="text-blue-400 font-bold">{selectedJenis}</span>
              </div>
              <div className="text-xs text-green-400 font-medium mt-0.5">
                  Materi: {inputMateri || '(Tanpa Judul)'}
              </div>
          </div>
          <div className="flex gap-3">
              <button 
                onClick={handleReset}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition flex items-center gap-2"
              >
                  <span>⬅️</span> Kembali
              </button>
              <button 
                onClick={() => setStep(4)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
              >
                  Ubah Materi
              </button>
          </div>
      </div>

      {/* Table Area */}
      <div className="bg-gray-800 shadow-xl overflow-hidden rounded-xl border border-gray-700 mb-20">
        {loading ? (
            <div className="p-20 text-center text-gray-400 animate-pulse">
                Memuat data siswa dan nilai...
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-750">
                        <tr>
                            <th className="px-6 py-4 text-center text-xs font-bold text-gray-300 uppercase w-16">No</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase">Nama Siswa</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase">NISN</th>
                            <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase w-48 bg-primary/20 border-b-2 border-primary">
                                Nilai {selectedJenis}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {students.map((student, idx) => (
                            <tr key={student.id} className="hover:bg-gray-750 transition-colors">
                                <td className="px-6 py-4 text-center text-sm text-gray-500">{idx + 1}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">{student.nama}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{student.nisn}</td>
                                <td className="px-6 py-3 bg-gray-900/30">
                                    <input 
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={localGrades[student.id] || ''}
                                        onChange={(e) => handleInputChange(student.id, e.target.value)}
                                        placeholder="0 - 100"
                                        className="w-full bg-gray-800 border-2 border-gray-600 rounded-lg px-4 py-2 text-white text-center font-bold focus:border-primary focus:ring-0 outline-none transition-all placeholder-gray-600 text-lg"
                                        onWheel={(e) => e.currentTarget.blur()} // Prevent scroll changing value
                                    />
                                </td>
                            </tr>
                        ))}
                        {students.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-10 text-center text-gray-500 italic">
                                    Tidak ada siswa di kelas ini.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-gray-900/90 backdrop-blur-md border-t border-gray-700 p-4 flex justify-between items-center z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
          <div className="text-gray-400 text-sm hidden md:block">
              Pastikan nilai sudah benar sebelum disimpan.
          </div>
          <div className="flex gap-4 w-full md:w-auto justify-end">
              <button 
                onClick={handleReset}
                disabled={saving}
                className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition w-full md:w-auto flex items-center justify-center gap-2"
              >
                  <span>❌</span> Batal
              </button>
              <button 
                onClick={handleSaveAll}
                disabled={saving || students.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto justify-center"
              >
                  {saving ? (
                      <>
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Menyimpan...
                      </>
                  ) : (
                      <>
                        <span>💾</span> Simpan Semua Nilai
                      </>
                  )}
              </button>
          </div>
      </div>
    </div>
  );
};
