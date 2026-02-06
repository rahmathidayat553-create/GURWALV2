
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

  // 1. Load Data Pengajaran (Sekali saat mount)
  useEffect(() => {
    const fetchAssignments = async () => {
      const { data, error } = await supabase
        .from('pengajaran')
        .select('*, kelas(*), mapel(*)')
        .eq('id_guru', currentUser.id);

      if (!error && data) {
        setAllPengajaran(data as unknown as Pengajaran[]);
      }
    };
    fetchAssignments();
  }, [currentUser.id]);

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

          // 2. Ambil Nilai Existing (Sesuai Kelas, Mapel, Jenis)
          // Kita tidak filter by Materi di query select agar jika guru mengedit materi,
          // nilai lama tetap muncul. Materi akan diupdate saat simpan.
          const { data: gradesData } = await supabase
            .from('nilai')
            .select('*')
            .eq('id_guru', currentUser.id)
            .eq('id_mapel', selectedMapel)
            .eq('jenis', selectedJenis)
            .in('id_siswa', studentsData.map(s => s.id));

          // 3. Map ke Local State
          const initialGrades: LocalGradeState = {};
          
          // Jika ada data nilai, kita ambil juga materinya untuk pre-fill inputMateri jika masih kosong
          let foundMateri = '';

          studentsData.forEach(s => {
              const record = gradesData?.find(g => g.id_siswa === s.id);
              if (record) {
                  initialGrades[s.id] = String(record.nilai);
                  if (record.materi && !foundMateri) foundMateri = record.materi;
              } else {
                  initialGrades[s.id] = '';
              }
          });

          // Jika user belum isi materi, tapi di DB sudah ada materi untuk jenis penilaian ini, gunakan dari DB
          if (!inputMateri && foundMateri) {
              setInputMateri(foundMateri);
          }

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
          const payload = [];
          const today = new Date().toISOString().split('T')[0];

          for (const student of students) {
              const valStr = localGrades[student.id];
              
              // Skip jika kosong (atau simpan null? Tergantung kebutuhan. Di sini kita simpan jika ada angka)
              // Jika ingin menghapus nilai, user isi 0 atau kita perlu logika delete. 
              // Sederhananya: Upsert nilai. Jika string kosong, kita anggap null.
              
              const numVal = valStr === '' ? null : parseFloat(valStr);
              
              // Validasi range
              if (numVal !== null && (numVal < 0 || numVal > 100)) {
                  throw new Error(`Nilai untuk ${student.nama} tidak valid (0-100)`);
              }

              // Kita perlu cek ID record lama untuk update, atau biarkan Supabase handle conflict
              // Sayangnya tabel nilai mungkin tidak punya unique constraint (id_siswa, id_mapel, jenis).
              // Mari kita cek dulu apakah record sudah ada untuk update spesifik ID-nya.
              
              // Strategi: Cari record lama di client side (kita punya 'gradesData' tadi tapi tidak disimpan di state global,
              // jadi kita query ulang atau percaya pada logic Upsert/Delete-Insert).
              
              // Paling aman untuk mencegah duplikat tanpa unique constraint DB:
              // 1. Hapus nilai lama (id_guru, id_siswa, id_mapel, jenis)
              // 2. Insert baru
              // ATAU Gunakan 'upsert' jika kita yakin tabel punya constraint/index unique. 
              
              // Asumsi: Tabel 'nilai' sebaiknya punya unique constraint pada (id_siswa, id_mapel, jenis).
              // Jika belum ada, query manual select id -> update/insert adalah cara aman.
              
              // Untuk performa UI React ini, kita lakukan query per siswa di dalam loop mungkin lambat.
              // Lebih baik: Hapus semua nilai tipe ini untuk kelas ini, lalu insert ulang? Riskan.
              
              // PENDEKATAN AMAN: Cek satu per satu (Upsert logic manual)
              const { data: existing } = await supabase
                .from('nilai')
                .select('id')
                .eq('id_guru', currentUser.id)
                .eq('id_siswa', student.id)
                .eq('id_mapel', selectedMapel)
                .eq('jenis', selectedJenis)
                .maybeSingle();

              if (numVal !== null) {
                  if (existing) {
                      await supabase.from('nilai').update({
                          nilai: numVal,
                          materi: inputMateri,
                          tanggal: today
                      }).eq('id', existing.id);
                  } else {
                      await supabase.from('nilai').insert([{
                          id_guru: currentUser.id,
                          id_siswa: student.id,
                          id_mapel: selectedMapel,
                          jenis: selectedJenis,
                          nilai: numVal,
                          materi: inputMateri,
                          tanggal: today
                      }]);
                  }
              } else {
                  // Jika nilai dikosongkan user, hapus dari DB jika ada
                  if (existing) {
                      await supabase.from('nilai').delete().eq('id', existing.id);
                  }
              }
          }

          showToast('✅ Semua nilai berhasil disimpan!', 'success');
          // Kembali ke dashboard atau reset? User mungkin mau edit lagi. Biarkan di step 5.
      } catch (error: any) {
          console.error(error);
          showToast(error.message || 'Gagal menyimpan nilai', 'error');
      } finally {
          setSaving(false);
      }
  };

  // --- RENDER STEPS ---

  // STEP 1: PILIH KELAS
  if (step === 1) {
      return (
          <div className="max-w-2xl mx-auto mt-10">
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
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
              >
                  Ganti Kelas/Mapel
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
