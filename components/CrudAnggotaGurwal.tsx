import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Guru, Siswa, Kelas } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import * as XLSX from 'xlsx';

interface CrudAnggotaGurwalProps {
  showToast: (msg: string, type: 'success' | 'error', duration?: number, position?: 'top-right' | 'center') => void;
}

export const CrudAnggotaGurwal: React.FC<CrudAnggotaGurwalProps> = ({ showToast }) => {
  const [guruWaliList, setGuruWaliList] = useState<Guru[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [kelasOptions, setKelasOptions] = useState<Kelas[]>([]);
  
  const [selectedGuru, setSelectedGuru] = useState<string>('');
  const [assignedSiswaIds, setAssignedSiswaIds] = useState<Set<string>>(new Set());
  
  // State untuk Custom Dropdown Guru
  const [isGuruDropdownOpen, setIsGuruDropdownOpen] = useState(false);
  const [guruSearchTerm, setGuruSearchTerm] = useState('');
  
  // State untuk menyimpan pemetaan global: StudentID -> GuruID
  const [allAssignments, setAllAssignments] = useState<Map<string, string>>(new Map());

  // Confirmation State for Removal (Uncheck)
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; nama: string } | null>(null);

  // Confirmation State for Transfer (Pindah Guru)
  const [pendingTransfer, setPendingTransfer] = useState<{ 
      siswaId: string; 
      siswaNama: string; 
      oldGuruId: string; 
      oldGuruNama: string 
  } | null>(null);

  // Filters
  const [filterKelas, setFilterKelas] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Initial Load: Gurus & Kelas & All Assignments
  useEffect(() => {
    const fetchInitial = async () => {
      // Mengambil data guru dengan peran 'GURU' 
      const { data: gurus } = await supabase
        .from('guru')
        .select('*')
        .eq('peran', 'GURU') 
        .order('nama');

      const { data: kelas } = await supabase.from('kelas').select('*').order('nama');
      const { data: siswa } = await supabase.from('siswa').select('*, kelas(nama)').order('nama');
      
      if (gurus) setGuruWaliList(gurus);
      if (kelas) setKelasOptions(kelas);
      // @ts-ignore
      if (siswa) setSiswaList(siswa);

      fetchGlobalAssignments();
    };
    fetchInitial();
  }, []);

  // Fetch seluruh data bimbingan untuk validasi global
  const fetchGlobalAssignments = async () => {
      const { data } = await supabase.from('bimbingan').select('id_siswa, id_guru');
      if (data) {
          const map = new Map<string, string>();
          data.forEach(item => map.set(item.id_siswa, item.id_guru));
          setAllAssignments(map);
      }
  };

  // 2. Load Bimbingan when Guru Selected
  useEffect(() => {
    if (selectedGuru) {
      fetchBimbingan();
    } else {
      setAssignedSiswaIds(new Set());
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGuru]);

  const fetchBimbingan = async () => {
    if (!selectedGuru) return;
    setLoading(true);
    const { data } = await supabase.from('bimbingan').select('id_siswa').eq('id_guru', selectedGuru);
    if (data) {
      setAssignedSiswaIds(new Set(data.map(item => item.id_siswa)));
    }
    setLoading(false);
  };

  // Logic to execute DB changes (Add/Remove for current guru)
  const executeToggle = async (id_siswa: string, nama_siswa: string, isAssigned: boolean) => {
    try {
      if (isAssigned) {
        // Remove assignment
        const { error } = await supabase
          .from('bimbingan')
          .delete()
          .eq('id_guru', selectedGuru)
          .eq('id_siswa', id_siswa);
        if (error) throw error;
        
        showToast(`Berhasil menghapus ${nama_siswa} dari binaan`, 'success');
      } else {
        // Add assignment
        const { error } = await supabase
          .from('bimbingan')
          .insert([{ id_guru: selectedGuru, id_siswa: id_siswa }]);
        if (error) throw error;

        // Tambahkan Toast Sukses
        showToast(`Berhasil menambahkan ${nama_siswa} ke binaan`, 'success', 2000, 'center');
        setSearchTerm(''); 
      }
      
      // Optimistic update for UI responsiveness
      const newSet = new Set(assignedSiswaIds);
      if (isAssigned) newSet.delete(id_siswa);
      else newSet.add(id_siswa);
      setAssignedSiswaIds(newSet);

      // Refresh global map untuk validasi terbaru
      fetchGlobalAssignments();

    } catch (e) {
      showToast('Gagal mengubah data', 'error');
      fetchBimbingan(); // Revert on error
    }
  };

  // Logic to execute Transfer (Move from Old Guru -> Current Guru)
  const executeTransfer = async () => {
      if (!pendingTransfer || !selectedGuru) return;

      try {
          // 1. Hapus data bimbingan lama (berdasarkan id_siswa, karena 1 siswa 1 wali)
          const { error: delError } = await supabase
            .from('bimbingan')
            .delete()
            .eq('id_siswa', pendingTransfer.siswaId);
          
          if (delError) throw delError;

          // 2. Tambahkan data bimbingan baru
          const { error: insError } = await supabase
            .from('bimbingan')
            .insert([{ id_guru: selectedGuru, id_siswa: pendingTransfer.siswaId }]);
          
          if (insError) throw insError;

          showToast(`Berhasil memindahkan ${pendingTransfer.siswaNama} ke guru ini.`, 'success');

          // Update UI
          const newSet = new Set(assignedSiswaIds);
          newSet.add(pendingTransfer.siswaId);
          setAssignedSiswaIds(newSet);
          
          fetchGlobalAssignments();
          setPendingTransfer(null);

      } catch (error) {
          console.error(error);
          showToast('Gagal memindahkan siswa.', 'error');
      }
  };

  // Handler triggered by checkbox click
  const handleToggleClick = (siswa: Siswa, isAssigned: boolean) => {
    if (!selectedGuru) {
      showToast('Pilih Guru Wali terlebih dahulu', 'error');
      return;
    }

    // Cek apakah milik orang lain
    const existingGuruId = allAssignments.get(siswa.id);
    if (existingGuruId && existingGuruId !== selectedGuru) {
        // Tombol checkbox didisable untuk kasus ini, 
        // tapi jika dipanggil manual, kita blokir.
        // Logika pindah ada di tombol "Pindah" terpisah.
        return; 
    }

    if (isAssigned) {
      // Uncheck / Hapus
      setPendingRemoval({ id: siswa.id, nama: siswa.nama });
    } else {
      // Check / Tambah
      executeToggle(siswa.id, siswa.nama, false);
    }
  };

  const handleConfirmRemoval = () => {
    if (pendingRemoval) {
      executeToggle(pendingRemoval.id, pendingRemoval.nama, true);
      setPendingRemoval(null);
    }
  };

  // --- EXPORT FUNCTION ---
  const handleExport = () => {
    if (allAssignments.size === 0) {
        showToast('Belum ada data anggota yang terdaftar.', 'error');
        return;
    }

    let dataToExport: any[] = [];
    let fileName = '';

    if (selectedGuru) {
        // 1. EKSPOR PER GURU
        const guru = guruWaliList.find(g => g.id === selectedGuru);
        const guruName = guru ? guru.nama : 'Unknown';
        fileName = `Binaan_${guruName.replace(/\s+/g, '_')}.xlsx`;

        // Filter siswa yang dipetakan ke guru ini
        const myStudentIds = Array.from(allAssignments.entries())
            .filter(([_, gId]) => gId === selectedGuru)
            .map(([sId, _]) => sId);

        const myStudents = siswaList.filter(s => myStudentIds.includes(s.id));

        dataToExport = myStudents.map((s, index) => ({
            'No': index + 1,
            'Nama Guru Wali': guruName,
            'Nama Siswa Binaan': s.nama,
            'NISN': s.nisn,
            'Kelas': s.kelas?.nama || '-'
        }));

    } else {
        // 2. EKSPOR SEMUA
        fileName = `Semua_Anggota_Gurwal_${new Date().toISOString().split('T')[0]}.xlsx`;

        const allEntries = Array.from(allAssignments.entries());
        
        let counter = 1;
        dataToExport = allEntries.map(([studentId, guruId]) => {
            const guru = guruWaliList.find(g => g.id === guruId);
            const siswa = siswaList.find(s => s.id === studentId);

            if (!guru || !siswa) return null;

            return {
                'No': 0, // Placeholder, will set later
                'Nama Guru Wali': guru.nama,
                'Nama Siswa Binaan': siswa.nama,
                'NISN': siswa.nisn,
                'Kelas': siswa.kelas?.nama || '-'
            };
        })
        .filter(item => item !== null)
        .sort((a: any, b: any) => {
             // Sort by Guru Name first, then Student Name
             const guruCompare = a['Nama Guru Wali'].localeCompare(b['Nama Guru Wali']);
             if (guruCompare !== 0) return guruCompare;
             return a['Nama Siswa Binaan'].localeCompare(b['Nama Siswa Binaan']);
        })
        .map((item: any, index) => ({ ...item, 'No': index + 1 })); // Re-index after sort
    }

    if (dataToExport.length === 0) {
        showToast('Tidak ada data siswa binaan untuk diekspor.', 'error');
        return;
    }

    // Create Excel
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Binaan");
    XLSX.writeFile(wb, fileName);
    
    showToast('Data berhasil diekspor!', 'success');
  };

  const filteredSiswa = siswaList
    .filter(s => {
      // Filter Pencarian & Kelas
      const matchSearch = s.nama.toLowerCase().includes(searchTerm.toLowerCase()) || s.nisn.includes(searchTerm);
      const matchKelas = filterKelas === '' || s.id_kelas === filterKelas;
      return matchSearch && matchKelas;
    })
    .sort((a, b) => {
      const aAssigned = assignedSiswaIds.has(a.id);
      const bAssigned = assignedSiswaIds.has(b.id);
      
      const aLocked = allAssignments.has(a.id) && allAssignments.get(a.id) !== selectedGuru;
      const bLocked = allAssignments.has(b.id) && allAssignments.get(b.id) !== selectedGuru;

      if (aAssigned && !bAssigned) return -1;
      if (!aAssigned && bAssigned) return 1;

      if (!aLocked && bLocked) return -1;
      if (aLocked && !bLocked) return 1;
      
      return a.nama.localeCompare(b.nama);
    });

  // Helper untuk mendapatkan nama guru berdasarkan ID
  const getGuruName = (guruId: string) => {
      const guru = guruWaliList.find(g => g.id === guruId);
      return guru ? guru.nama : 'Guru Lain';
  };

  // --- LOGIC CUSTOM SEARCH DROPDOWN ---
  const filteredGuruList = guruWaliList.filter(g => 
    g.nama.toLowerCase().includes(guruSearchTerm.toLowerCase()) || 
    (g.nip && g.nip.includes(guruSearchTerm))
  );

  const selectedGuruObj = guruWaliList.find(g => g.id === selectedGuru);
  const selectedGuruLabel = selectedGuruObj 
    ? `${selectedGuruObj.nama} - ${selectedGuruObj.nip || 'No NIP'}`
    : '-- Pilih Guru --';

  return (
    <div>
      {/* Dialog Konfirmasi Hapus Anggota */}
      <ConfirmDialog 
        isOpen={!!pendingRemoval}
        message={`Apakah Anda yakin menghapus anggota ${pendingRemoval?.nama} dari binaan guru ini?`}
        onConfirm={handleConfirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />

      {/* Dialog Konfirmasi Pindah Anggota */}
      <ConfirmDialog 
        isOpen={!!pendingTransfer}
        message={`Konfirmasi Pindah: Apakah Anda yakin ingin memindahkan siswa "${pendingTransfer?.siswaNama}" dari ${pendingTransfer?.oldGuruNama} ke guru yang sedang dipilih?`}
        onConfirm={executeTransfer}
        onCancel={() => setPendingTransfer(null)}
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
            <h2 className="text-2xl font-bold text-white">Manajemen Anggota GurWal</h2>
            <p className="text-gray-400 mt-1">
                Tetapkan siswa binaan kepada guru.
            </p>
        </div>
        <button 
            onClick={handleExport}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-lg flex items-center gap-2"
        >
            <span>📊</span>
            {selectedGuru ? 'Ekspor Data (Guru Ini)' : 'Ekspor Semua Data'}
        </button>
      </div>

      {/* Main Filter Section */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mb-6 relative">
        <label className="block text-sm font-medium text-gray-300 mb-2">Pilih Guru (Calon Guru Wali)</label>
        
        <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Custom Searchable Select */}
            <div className="w-full md:w-1/2 relative">
                {/* Trigger Button */}
                <button 
                  onClick={() => setIsGuruDropdownOpen(!isGuruDropdownOpen)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-left flex justify-between items-center focus:outline-none focus:border-primary"
                >
                    <span className={!selectedGuru ? 'text-gray-400' : 'text-white font-medium'}>
                        {selectedGuruLabel}
                    </span>
                    <span className="text-gray-400 text-xs">▼</span>
                </button>

                {/* Dropdown Content */}
                {isGuruDropdownOpen && (
                    <>
                        {/* Backdrop to close on click outside */}
                        <div 
                           className="fixed inset-0 z-10 cursor-default" 
                           onClick={() => setIsGuruDropdownOpen(false)}
                        ></div>
                        
                        <div className="absolute z-20 w-full bg-gray-700 border border-gray-500 mt-1 rounded shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden">
                             {/* Search Input Sticky Header */}
                             <div className="p-2 sticky top-0 bg-gray-700 border-b border-gray-600">
                                <input
                                    type="text"
                                    placeholder="Cari nama atau NIP..."
                                    value={guruSearchTerm}
                                    onChange={(e) => setGuruSearchTerm(e.target.value)}
                                    autoFocus
                                    className="w-full bg-gray-800 border border-gray-500 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-primary placeholder-gray-500"
                                    onClick={(e) => e.stopPropagation()} // Prevent closing when clicking input
                                />
                             </div>

                             {/* List Options */}
                             {filteredGuruList.length > 0 ? (
                                filteredGuruList.map(g => (
                                    <div 
                                        key={g.id}
                                        onClick={() => {
                                            setSelectedGuru(g.id);
                                            setIsGuruDropdownOpen(false);
                                            setGuruSearchTerm(''); // Optional: clear search after select
                                        }}
                                        className={`px-4 py-2 cursor-pointer text-sm flex flex-col hover:bg-gray-600 transition-colors ${selectedGuru === g.id ? 'bg-primary/20 text-primary' : 'text-white'}`}
                                    >
                                        <span className="font-medium">{g.nama}</span>
                                        <span className="text-xs text-gray-400">{g.nip || 'No NIP'}</span>
                                    </div>
                                ))
                             ) : (
                                <div className="px-4 py-3 text-gray-400 text-sm text-center">
                                    Guru tidak ditemukan.
                                </div>
                             )}
                        </div>
                    </>
                )}
            </div>

            {selectedGuru && (
                 <span className="text-sm text-green-400 bg-green-900/30 px-3 py-1 rounded-full border border-green-800 font-medium animate-pulse">
                    ✅ Guru Terpilih
                 </span>
            )}
        </div>
        {!selectedGuru && <p className="text-yellow-500 text-sm mt-2">Silakan cari dan pilih guru terlebih dahulu untuk mengelola siswa binaannya.</p>}
      </div>

      {/* Siswa List Section */}
      {selectedGuru && (
        <>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Cari Siswa / NISN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400"
              />
            </div>
            <div className="w-full md:w-64">
              <select
                value={filterKelas}
                onChange={(e) => setFilterKelas(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              >
                <option value="">Semua Kelas</option>
                {kelasOptions.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
            {loading ? <p className="p-4 text-gray-400">Memuat data bimbingan...</p> : (
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase w-10">Pilih</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {filteredSiswa.map(siswa => {
                    const isAssignedToMe = assignedSiswaIds.has(siswa.id);
                    const ownerGuruId = allAssignments.get(siswa.id);
                    // Locked jika punya guru wali TAPI bukan guru yang sedang dipilih
                    const isLocked = ownerGuruId && ownerGuruId !== selectedGuru;
                    const ownerName = isLocked ? getGuruName(ownerGuruId) : '';

                    return (
                      <tr 
                        key={siswa.id} 
                        className={`transition-all duration-300 ${
                            isAssignedToMe 
                                ? 'bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.15)] border-l-4 border-green-500' // Binaan Sendiri
                                : isLocked 
                                    ? 'bg-gray-900/50' // Milik orang lain (agak gelap)
                                    : 'hover:bg-gray-700 border-l-4 border-transparent' // Available
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={isAssignedToMe}
                            onChange={() => handleToggleClick(siswa, isAssignedToMe)}
                            disabled={!!isLocked}
                            className={`w-5 h-5 rounded focus:ring-offset-0 ${
                                isLocked 
                                ? 'cursor-not-allowed bg-gray-600 text-gray-500' 
                                : 'cursor-pointer text-green-500 focus:ring-green-500 bg-gray-700 accent-green-600'
                            }`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`font-medium ${
                                isAssignedToMe ? 'text-green-400' : isLocked ? 'text-gray-300' : 'text-white'
                            }`}>
                              {siswa.nama}
                            </div>
                            <div className="text-xs text-gray-500">{siswa.nisn}</div>
                            
                            {/* Keterangan Terkunci */}
                            {isLocked && (
                                <div className="text-xs text-yellow-500 mt-1 flex items-center gap-1 italic">
                                    <span>🔒 Telah menjadi anggota {ownerName}</span>
                                </div>
                            )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                            {siswa.kelas?.nama || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isAssignedToMe ? (
                            <span className="bg-green-900 text-green-200 text-xs px-2 py-1 rounded-full font-bold border border-green-700 shadow-[0_0_5px_rgba(34,197,94,0.4)]">
                                ✓ Binaan Anda
                            </span>
                          ) : isLocked ? (
                            <button
                                onClick={() => setPendingTransfer({
                                    siswaId: siswa.id,
                                    siswaNama: siswa.nama,
                                    oldGuruId: ownerGuruId!,
                                    oldGuruNama: ownerName
                                })}
                                className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded-full font-medium transition shadow-sm border border-yellow-600"
                            >
                                ↔ Pindah Anggota
                            </button>
                          ) : (
                            <span className="text-gray-500 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSiswa.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-gray-500">
                        Siswa tidak ditemukan.
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};