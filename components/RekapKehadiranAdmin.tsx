import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Guru, Kelas } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSekolah } from '../hooks/useSekolah';

interface RekapKehadiranAdminProps {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

interface RekapRow {
  id_siswa: string;
  nama_siswa: string;
  nisn: string;
  kelas: string;
  nama_wali: string;
  nip_wali: string | null;
  hadir: number;
  sakit: number;
  izin: number;
  alpha: number;
}

interface HistoryRow {
    id: string;
    tanggal: string;
    status: string;
    catatan: string;
}

type FilterTimeType = 'ALL' | 'MONTH' | 'RANGE';

export const RekapKehadiranAdmin: React.FC<RekapKehadiranAdminProps> = ({ showToast }) => {
  const sekolah = useSekolah();
  
  // Data State
  const [data, setData] = useState<RekapRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter Data (Guru & Kelas)
  const [gurus, setGurus] = useState<Guru[]>([]);
  const [kelasOptions, setKelasOptions] = useState<Kelas[]>([]);
  const [selectedGuru, setSelectedGuru] = useState<string>('');
  const [selectedKelas, setSelectedKelas] = useState<string>('');

  // Filter Waktu
  const [filterType, setFilterType] = useState<FilterTimeType>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Modal Detail State
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<RekapRow | null>(null);
  const [studentHistory, setStudentHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    // 1. Fetch Option Filters (Guru & Kelas)
    const fetchOptions = async () => {
      const { data: g } = await supabase.from('guru').select('*').eq('peran', 'GURU').order('nama');
      const { data: k } = await supabase.from('kelas').select('*').order('nama');
      if (g) setGurus(g);
      if (k) setKelasOptions(k);
    };

    fetchOptions();
  }, []);

  // Fetch Data Utama (Triggered saat filter waktu berubah)
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, selectedMonth, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Get All Students with Class info
      const { data: siswaData, error: siswaError } = await supabase
        .from('siswa')
        .select('id, nama, nisn, kelas(nama)');

      if (siswaError) throw siswaError;

      // 2. Get All Assignments (Bimbingan) to map to Wali
      const { data: bimbinganData } = await supabase
        .from('bimbingan')
        .select('id_siswa, id_guru, guru(nama, nip)');

      // Create Map: SiswaID -> { NamaWali, NIPWali, GuruID }
      const waliMap = new Map();
      bimbinganData?.forEach((b: any) => {
        waliMap.set(b.id_siswa, {
            nama: b.guru?.nama || 'Belum Ada',
            nip: b.guru?.nip,
            id_guru: b.id_guru
        });
      });

      // 3. Get Attendance based on Time Filter
      let query = supabase.from('kehadiran').select('id_siswa, status, tanggal');

      if (filterType === 'MONTH' && selectedMonth) {
          const [year, month] = selectedMonth.split('-');
          // First day of month
          const startDate = `${year}-${month}-01`;
          // Last day of month
          const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
          
          query = query.gte('tanggal', startDate).lte('tanggal', endDate);
      } else if (filterType === 'RANGE' && dateRange.start && dateRange.end) {
          query = query.gte('tanggal', dateRange.start).lte('tanggal', dateRange.end);
      }

      const { data: kehadiranData, error: kehadiranError } = await query;
      if (kehadiranError) throw kehadiranError;
      
      // Aggregate in memory
      const attendanceMap = new Map();
      kehadiranData?.forEach((k: any) => {
          if (!attendanceMap.has(k.id_siswa)) {
              attendanceMap.set(k.id_siswa, { H: 0, S: 0, I: 0, A: 0 });
          }
          const stats = attendanceMap.get(k.id_siswa);
          if (k.status === 'HADIR') stats.H++;
          else if (k.status === 'SAKIT') stats.S++;
          else if (k.status === 'IZIN') stats.I++;
          else if (k.status === 'ALPHA') stats.A++;
      });

      // 4. Combine all data
      const rows: RekapRow[] = siswaData?.map((s: any) => {
          const wali = waliMap.get(s.id) || { nama: '-', nip: null, id_guru: null };
          const stats = attendanceMap.get(s.id) || { H: 0, S: 0, I: 0, A: 0 };

          return {
              id_siswa: s.id,
              nama_siswa: s.nama,
              nisn: s.nisn,
              kelas: s.kelas?.nama || '-',
              nama_wali: wali.nama,
              nip_wali: wali.nip,
              // Hidden field for filtering purposes
              _id_guru: wali.id_guru, 
              _id_kelas: s.kelas?.id, 
              hadir: stats.H,
              sakit: stats.S,
              izin: stats.I,
              alpha: stats.A
          };
      }) || [];

      setData(rows);

    } catch (e) {
      console.error(e);
      showToast('Gagal memuat data rekap', 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- Filtering Logic (Guru & Kelas) ---
  const filteredData = data.filter(row => {
      // @ts-ignore
      const matchGuru = selectedGuru === '' || row._id_guru === selectedGuru;
      // Filter by Kelas Name
      const selectedClassObj = kelasOptions.find(k => k.id === selectedKelas);
      const matchKelas = selectedKelas === '' || row.kelas === selectedClassObj?.nama;
      
      return matchGuru && matchKelas;
  });

  // --- Helper: Get Period String ---
  const getPeriodString = () => {
      if (filterType === 'MONTH') {
          const date = new Date(selectedMonth + '-01');
          return `Bulan: ${date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
      }
      if (filterType === 'RANGE') {
          return `Periode: ${dateRange.start} s/d ${dateRange.end}`;
      }
      return 'Semua Waktu';
  };

  // --- VIEW DETAILS LOGIC ---
  const handleViewDetails = async (student: RekapRow) => {
      setSelectedStudent(student);
      setShowModal(true);
      setLoadingHistory(true);
      setStudentHistory([]);

      try {
          let query = supabase
            .from('kehadiran')
            .select('*')
            .eq('id_siswa', student.id_siswa)
            .order('tanggal', { ascending: false });

          // Apply same time filters to history
          if (filterType === 'MONTH' && selectedMonth) {
                const [year, month] = selectedMonth.split('-');
                const startDate = `${year}-${month}-01`;
                const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
                query = query.gte('tanggal', startDate).lte('tanggal', endDate);
          } else if (filterType === 'RANGE' && dateRange.start && dateRange.end) {
                query = query.gte('tanggal', dateRange.start).lte('tanggal', dateRange.end);
          }

          const { data, error } = await query;
          
          if (error) throw error;
          // @ts-ignore
          setStudentHistory(data || []);
      } catch (err) {
          showToast('Gagal memuat riwayat kehadiran', 'error');
      } finally {
          setLoadingHistory(false);
      }
  };

  // --- EXPORT FUNCTIONS ---

  const handleExportExcel = () => {
    if (filteredData.length === 0) {
        showToast('Tidak ada data untuk diekspor', 'error');
        return;
    }

    const exportData = filteredData.map((row, idx) => ({
        'No': idx + 1,
        'Nama Siswa': row.nama_siswa,
        'NISN': row.nisn,
        'Kelas': row.kelas,
        'Guru Wali': row.nama_wali,
        'Hadir': row.hadir,
        'Sakit': row.sakit,
        'Izin': row.izin,
        'Alpha': row.alpha,
        'Periode': getPeriodString()
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Kehadiran");
    XLSX.writeFile(wb, `Rekap_Kehadiran_Admin_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDFList = () => {
    if (filteredData.length === 0) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(16);
    doc.text('REKAPITULASI KEHADIRAN SISWA', 105, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`${sekolah.nama || 'Sekolah'}`, 105, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.text(getPeriodString(), 105, 28, { align: 'center' });
    doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 105, 34, { align: 'center' });

    const tableColumn = ["No", "Nama Siswa", "NISN", "Kelas", "Wali Kelas", "H", "S", "I", "A"];
    const tableRows: any[] = [];

    filteredData.forEach((row, index) => {
        const rowData = [
            index + 1,
            row.nama_siswa,
            row.nisn,
            row.kelas,
            row.nama_wali,
            row.hadir,
            row.sakit,
            row.izin,
            row.alpha
        ];
        tableRows.push(rowData);
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229] } // Indigo-600
    });

    doc.save(`rekap_kehadiran_list.pdf`);
  };

  const handleExportPDFIndividual = (row: RekapRow) => {
    const doc = new jsPDF();
    
    // --- KOP SURAT ---
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;
    
    // Text Kop
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text((sekolah.nama || "NAMA SEKOLAH").toUpperCase(), pageWidth / 2, yPos, { align: "center" });
    
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(sekolah.alamat || "Alamat Sekolah...", pageWidth / 2, yPos, { align: "center" });
    
    yPos += 5;
    doc.text(`Telp: ${sekolah.no_telp || '-'} | Email: ${sekolah.email || '-'}`, pageWidth / 2, yPos, { align: "center" });
    
    yPos += 5;
    doc.setLineWidth(0.5);
    doc.line(10, yPos, pageWidth - 10, yPos); // Garis Kop
    
    // --- CONTENT ---
    yPos += 15;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("LAPORAN KEHADIRAN SISWA", pageWidth / 2, yPos, { align: "center" });
    
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(getPeriodString(), pageWidth / 2, yPos, { align: "center" });

    yPos += 15;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    
    // Student Info
    doc.text(`Nama Siswa : ${row.nama_siswa}`, 20, yPos);
    doc.text(`Kelas        : ${row.kelas}`, 120, yPos);
    yPos += 7;
    doc.text(`NISN         : ${row.nisn}`, 20, yPos);
    doc.text(`Wali Kelas   : ${row.nama_wali}`, 120, yPos);

    yPos += 15;
    
    // Table Summary
    const tableData = [
        ['Keterangan', 'Jumlah'],
        ['Hadir (H)', `${row.hadir} Hari`],
        ['Sakit (S)', `${row.sakit} Hari`],
        ['Izin (I)', `${row.izin} Hari`],
        ['Tanpa Keterangan (A)', `${row.alpha} Hari`],
        ['TOTAL KETIDAKHADIRAN', `${row.sakit + row.izin + row.alpha} Hari`]
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['KETERANGAN', 'JUMLAH']],
        body: tableData.slice(1), 
        theme: 'plain',
        styles: { fontSize: 11, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 50, fontStyle: 'bold' }
        },
        margin: { left: 20 }
    });

    // --- SIGNATURE ---
    // @ts-ignore
    let finalY = (doc as any).lastAutoTable.finalY + 30;
    
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    doc.text(`...................., ${dateStr}`, 140, finalY);
    finalY += 7;
    doc.text("Wali Kelas,", 140, finalY);
    
    finalY += 25;
    doc.setFont("helvetica", "bold");
    doc.text(row.nama_wali, 140, finalY);
    finalY += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`NIP. ${row.nip_wali || '....................'}`, 140, finalY);

    doc.save(`Laporan_Kehadiran_${row.nama_siswa.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
            <h2 className="text-2xl font-bold text-white">Rekap Kehadiran Global</h2>
            <p className="text-gray-400 mt-1">Data kehadiran seluruh siswa dari semua kelas/guru.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={handleExportPDFList}
                disabled={loading || filteredData.length === 0}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium transition flex items-center gap-2 disabled:opacity-50"
            >
                📄 PDF (List)
            </button>
            <button 
                onClick={handleExportExcel}
                disabled={loading || filteredData.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium transition flex items-center gap-2 disabled:opacity-50"
            >
                📊 Excel
            </button>
        </div>
      </div>

      {/* Main Filter Section */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mb-6 space-y-4">
        
        {/* Row 1: Filter Waktu */}
        <div className="pb-4 border-b border-gray-700">
             <label className="text-white text-sm font-bold mb-2 block">📅 Filter Waktu Kehadiran</label>
             <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-1/4">
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as FilterTimeType)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white font-medium"
                    >
                        <option value="ALL">Semua Waktu</option>
                        <option value="MONTH">Per Bulan</option>
                        <option value="RANGE">Rentang Tanggal (Custom)</option>
                    </select>
                </div>

                {filterType === 'MONTH' && (
                    <div className="w-full md:w-1/4">
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        />
                    </div>
                )}

                {filterType === 'RANGE' && (
                    <div className="flex flex-1 gap-2 items-center">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        />
                    </div>
                )}
             </div>
             <p className="text-xs text-gray-400 mt-2">
                * Data yang ditampilkan (H/S/I/A) akan dihitung ulang berdasarkan filter waktu yang dipilih.
             </p>
        </div>

        {/* Row 2: Filter Data */}
        <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
                <label className="text-gray-400 text-sm mb-1 block">Filter Guru Wali</label>
                <select 
                    value={selectedGuru}
                    onChange={(e) => setSelectedGuru(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                    <option value="">Semua Guru</option>
                    {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
            </div>
            <div className="flex-1">
                <label className="text-gray-400 text-sm mb-1 block">Filter Kelas</label>
                <select 
                    value={selectedKelas}
                    onChange={(e) => setSelectedKelas(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                    <option value="">Semua Kelas</option>
                    {kelasOptions.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
            </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-700">
        {loading ? <p className="p-6 text-gray-400">Sedang menghitung data kehadiran...</p> : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">No</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nama Siswa</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">NISN</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Kelas</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Guru Wali</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-green-400 uppercase font-bold">H</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-yellow-400 uppercase font-bold">S</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-blue-400 uppercase font-bold">I</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-red-400 uppercase font-bold">A</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {filteredData.map((row, index) => (
                            <tr key={row.id_siswa} className="hover:bg-gray-700 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{index + 1}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{row.nama_siswa}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{row.nisn}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.kelas}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 text-xs">{row.nama_wali}</td>
                                <td className="px-4 py-4 text-center font-bold text-green-500 bg-green-900/10">{row.hadir}</td>
                                <td className="px-4 py-4 text-center font-bold text-yellow-500 bg-yellow-900/10">{row.sakit}</td>
                                <td className="px-4 py-4 text-center font-bold text-blue-500 bg-blue-900/10">{row.izin}</td>
                                <td className="px-4 py-4 text-center font-bold text-red-500 bg-red-900/10">{row.alpha}</td>
                                <td className="px-6 py-4 text-center space-x-2">
                                    <button 
                                        onClick={() => handleViewDetails(row)}
                                        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded border border-blue-500 transition"
                                        title="Lihat Detail & Riwayat"
                                    >
                                        👁️ Lihat
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredData.length === 0 && (
                            <tr><td colSpan={10} className="p-6 text-center text-gray-500">Data tidak ditemukan pada periode/filter ini.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* MODAL VIEW DETAILS */}
      {showModal && selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl p-6 border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-start mb-6 border-b border-gray-700 pb-4">
                    <div>
                        <h3 className="text-2xl font-bold text-white mb-1">{selectedStudent.nama_siswa}</h3>
                        <p className="text-gray-400 text-sm">{selectedStudent.nisn} | Kelas: {selectedStudent.kelas} | Wali: {selectedStudent.nama_wali}</p>
                        <p className="text-blue-400 text-xs mt-1 font-bold">{getPeriodString()}</p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-green-900/30 p-3 rounded border border-green-800 text-center">
                        <span className="block text-2xl font-bold text-green-400">{selectedStudent.hadir}</span>
                        <span className="text-xs text-green-200">Hadir</span>
                    </div>
                    <div className="bg-yellow-900/30 p-3 rounded border border-yellow-800 text-center">
                        <span className="block text-2xl font-bold text-yellow-400">{selectedStudent.sakit}</span>
                        <span className="text-xs text-yellow-200">Sakit</span>
                    </div>
                    <div className="bg-blue-900/30 p-3 rounded border border-blue-800 text-center">
                        <span className="block text-2xl font-bold text-blue-400">{selectedStudent.izin}</span>
                        <span className="text-xs text-blue-200">Izin</span>
                    </div>
                    <div className="bg-red-900/30 p-3 rounded border border-red-800 text-center">
                        <span className="block text-2xl font-bold text-red-400">{selectedStudent.alpha}</span>
                        <span className="text-xs text-red-200">Alpha</span>
                    </div>
                </div>

                <div className="flex-1 overflow-auto mb-4 border border-gray-700 rounded bg-gray-900/50">
                    {loadingHistory ? (
                        <div className="p-8 text-center text-gray-500">Memuat riwayat...</div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Tanggal</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-300">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Catatan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {studentHistory.map(h => (
                                    <tr key={h.id}>
                                        <td className="px-4 py-2 text-sm text-gray-300 whitespace-nowrap">{h.tanggal}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                h.status === 'HADIR' ? 'bg-green-900 text-green-300' :
                                                h.status === 'SAKIT' ? 'bg-yellow-900 text-yellow-300' :
                                                h.status === 'IZIN' ? 'bg-blue-900 text-blue-300' :
                                                'bg-red-900 text-red-300'
                                            }`}>
                                                {h.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-400 italic">{h.catatan || '-'}</td>
                                    </tr>
                                ))}
                                {studentHistory.length === 0 && (
                                    <tr><td colSpan={3} className="p-4 text-center text-sm text-gray-500">Tidak ada riwayat kehadiran tercatat pada periode ini.</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                     <button 
                        onClick={() => setShowModal(false)}
                        className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded font-medium transition"
                    >
                        Tutup
                    </button>
                    <button 
                        onClick={() => handleExportPDFIndividual(selectedStudent)}
                        className="bg-primary hover:bg-secondary text-white px-4 py-2 rounded font-bold transition flex items-center gap-2 shadow-lg"
                    >
                        🖨️ Ekspor Laporan PDF
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};