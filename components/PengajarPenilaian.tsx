import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru, Siswa, Kelas, Mapel, Nilai } from '../types';

interface PengajarPenilaianProps {
  currentUser: Guru;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const PengajarPenilaian: React.FC<PengajarPenilaianProps> = ({ currentUser, showToast }) => {
  const [kelasOptions, setKelasOptions] = useState<Kelas[]>([]);
  const [mapelOptions, setMapelOptions] = useState<Mapel[]>([]);
  
  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [selectedMapel, setSelectedMapel] = useState<string>('');
  
  const [students, setStudents] = useState<Siswa[]>([]);
  const [existingGrades, setExistingGrades] = useState<Nilai[]>([]);
  const [loading, setLoading] = useState(false);

  // Load Teaching Assignment (Pengajaran) to filter dropdowns
  useEffect(() => {
    const fetchAssignments = async () => {
      const { data, error } = await supabase
        .from('pengajaran')
        .select('*, kelas(*), mapel(*)')
        .eq('id_guru', currentUser.id);

      if (!error && data) {
        // Extract unique Kelas
        const uniqueKelas = Array.from(new Map(data.map(item => [item.id_kelas, item.kelas])).values());
        // Extract unique Mapel
        const uniqueMapel = Array.from(new Map(data.map(item => [item.id_mapel, item.mapel])).values());
        
        // @ts-ignore
        setKelasOptions(uniqueKelas);
        // @ts-ignore
        setMapelOptions(uniqueMapel);
      }
    };
    fetchAssignments();
  }, [currentUser.id]);

  // Fetch Students and Grades when filter changes
  useEffect(() => {
    if (selectedKelas && selectedMapel) {
      const fetchData = async () => {
        setLoading(true);
        try {
          // Fetch students first
          const { data: studentsData, error: studentsError } = await supabase
            .from('siswa')
            .select('*')
            .eq('id_kelas', selectedKelas)
            .order('nama');

          if (studentsError) throw studentsError;

          const studentIds = studentsData?.map(s => s.id) || [];
          let gradesData: Nilai[] = [];

          if (studentIds.length > 0) {
            const { data: grades, error: gradesError } = await supabase
              .from('nilai')
              .select('*')
              .eq('id_guru', currentUser.id)
              .eq('id_mapel', selectedMapel)
              .in('id_siswa', studentIds);
            
            if (gradesError) throw gradesError;
            gradesData = grades || [];
          }

          setStudents(studentsData || []);
          setExistingGrades(gradesData);
        } catch (error) {
          showToast('Gagal memuat data siswa/nilai', 'error');
        } finally {
          setLoading(false);
        }
      };

      fetchData();

      // Realtime subscription for grades
      const channel = supabase
        .channel('nilai_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai', filter: `id_mapel=eq.${selectedMapel}` }, () => {
             // Refresh grades only
             supabase
              .from('nilai')
              .select('*')
              .eq('id_guru', currentUser.id)
              .eq('id_mapel', selectedMapel)
              .then(({ data }) => {
                 if(data) setExistingGrades(data);
              });
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };

    } else {
      setStudents([]);
      setExistingGrades([]);
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKelas, selectedMapel, currentUser.id]);

  // Helper to get grade value
  const getGradeValue = (studentId: string, type: 'FORMATIF' | 'SUMATIF' | 'AKHIR_SUMATIF') => {
    const grade = existingGrades.find(g => g.id_siswa === studentId && g.jenis === type);
    return grade ? grade.nilai : '';
  };

  const handleGradeChange = async (studentId: string, type: 'FORMATIF' | 'SUMATIF' | 'AKHIR_SUMATIF', value: string) => {
    const numVal = parseFloat(value);
    if (value !== '' && (isNaN(numVal) || numVal < 0 || numVal > 100)) {
        return; // Validation simple
    }

    const numericValue = value === '' ? null : numVal;
    
    // Find existing grade record
    const existing = existingGrades.find(g => g.id_siswa === studentId && g.jenis === type);
    
    try {
        if (numericValue === null) {
            return;
        }

        let error;
        if (existing) {
             const { error: err } = await supabase
                .from('nilai')
                .update({ nilai: numericValue, tanggal: new Date().toISOString().split('T')[0] })
                .eq('id', existing.id);
             error = err;
        } else {
             const { error: err } = await supabase
                .from('nilai')
                .insert([{
                    id_guru: currentUser.id,
                    id_siswa: studentId,
                    id_mapel: selectedMapel,
                    jenis: type,
                    nilai: numericValue,
                    tanggal: new Date().toISOString().split('T')[0]
                }]);
             error = err;
        }

        if (error) throw error;
        
        // Refresh grades immediately
        const { data: newVal } = await supabase.from('nilai').select('*').eq('id_guru', currentUser.id).eq('id_mapel', selectedMapel);
        if(newVal) setExistingGrades(newVal);
        
    } catch (e) {
        showToast('Gagal menyimpan nilai', 'error');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Input Penilaian</h2>
      
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div>
           <label className="block text-sm font-medium text-gray-300 mb-1">Pilih Kelas</label>
           <select 
             className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
             value={selectedKelas}
             onChange={(e) => setSelectedKelas(e.target.value)}
           >
             <option value="">-- Pilih Kelas --</option>
             {kelasOptions.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
           </select>
        </div>
        <div>
           <label className="block text-sm font-medium text-gray-300 mb-1">Pilih Mata Pelajaran</label>
           <select 
             className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
             value={selectedMapel}
             onChange={(e) => setSelectedMapel(e.target.value)}
           >
             <option value="">-- Pilih Mapel --</option>
             {mapelOptions.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
           </select>
        </div>
      </div>

      {/* Table */}
      {selectedKelas && selectedMapel ? (
         <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
            {loading ? <p className="p-4 text-gray-400">Memuat data siswa...</p> : (
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase w-32">Formatif</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase w-32">Sumatif</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase w-32">Akhir Sumatif</th>
                </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                {students.map((student) => (
                    <tr key={student.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{student.nama}</td>
                    <td className="px-6 py-4">
                        <input 
                            type="number" min="0" max="100"
                            className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-center"
                            placeholder="0-100"
                            defaultValue={getGradeValue(student.id, 'FORMATIF')}
                            onBlur={(e) => handleGradeChange(student.id, 'FORMATIF', e.target.value)}
                        />
                    </td>
                    <td className="px-6 py-4">
                        <input 
                            type="number" min="0" max="100"
                            className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-center"
                            placeholder="0-100"
                            defaultValue={getGradeValue(student.id, 'SUMATIF')}
                            onBlur={(e) => handleGradeChange(student.id, 'SUMATIF', e.target.value)}
                        />
                    </td>
                    <td className="px-6 py-4">
                         <input 
                            type="number" min="0" max="100"
                            className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-center"
                            placeholder="0-100"
                            defaultValue={getGradeValue(student.id, 'AKHIR_SUMATIF')}
                            onBlur={(e) => handleGradeChange(student.id, 'AKHIR_SUMATIF', e.target.value)}
                        />
                    </td>
                    </tr>
                ))}
                {students.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-500">Tidak ada siswa di kelas ini.</td></tr>
                )}
                </tbody>
            </table>
            )}
         </div>
      ) : (
          <div className="p-10 text-center text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
              Silakan pilih Kelas dan Mata Pelajaran terlebih dahulu.
          </div>
      )}
    </div>
  );
};