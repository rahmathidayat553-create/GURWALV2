import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Guru, Pelanggaran, Prestasi } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSekolah } from '../../hooks/useSekolah';

interface Props {
  currentUser: Guru;
}

interface StudentStat {
  id: string;
  nama: string;
  nisn: string;
  kelas: string;
  h: number;
  s: number;
  i: number;
  a: number;
  total_absen: number;
}

type FilterType = 'ALL' | 'MONTH';

export const LaporanBinaan: React.FC<Props> = ({ currentUser }) => {
  const sekolah = useSekolah();
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);
  const [summary, setSummary] = useState({ hadir: 0, sakit: 0, izin: 0, alpha: 0 });
  const [loading, setLoading] = useState(true);

  // Filter State
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // Format YYYY-MM

  // Modal Detail State
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentStat | null>(null);
  const [detailRecords, setDetailRecords] = useState<{ pelanggaran: Pelanggaran[], prestasi: Prestasi[] }>({ pelanggaran: [], prestasi: [] });
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // State untuk loading tombol PDF individual
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        // 1. Ambil daftar siswa binaan (Master Data)
        const { data: bimbinganData } = await supabase
          .from('bimbingan')
          .select('*, siswa(id, nama, nisn, kelas(nama))')
          .eq('id_guru', currentUser.id);

        if (!bimbinganData) {
            setLoading(false);
            return;
        }

        // 2. Query Data Kehadiran dengan Filter Waktu
        let attQuery = supabase
          .from('kehadiran')
          .select('id_siswa, status, tanggal')
          .eq('id_guru', currentUser.id);

        if (filterType === 'MONTH' && selectedMonth) {
            const [year, month] = selectedMonth.split('-');
            const startDate = `${year}-${month}-01`;
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
            
            attQuery = attQuery.gte('tanggal', startDate).lte('tanggal', endDate);
        }

        const { data: attData } = await attQuery;

        // 3. Proses Data
        const attendanceMap = new Map<string, {h:number, s:number, i:number, a:number}>();
        
        let totalH = 0, totalS = 0, totalI = 0, totalA = 0;

        // Inisialisasi Map untuk semua siswa binaan
        bimbinganData.forEach(b => {
            attendanceMap.set(b.id_siswa, { h: 0, s: 0, i: 0, a: 0 });
        });

        // Hitung Kehadiran dari data yang sudah difilter
        attData?.forEach(row => {
            const current = attendanceMap.get(row.id_siswa);
            if (current) {
                if (row.status === 'HADIR') { current.h++; totalH++; }
                else if (row.status === 'SAKIT') { current.s++; totalS++; }
                else if (row.status === 'IZIN') { current.i++; totalI++; }
                else if (row.status === 'ALPHA') { current.a++; totalA++; }
            }
        });

        // Format Data untuk Table & Chart
        const stats: StudentStat[] = bimbinganData.map(b => {
            const st = attendanceMap.get(b.id_siswa) || { h: 0, s: 0, i: 0, a: 0 };
            return {
                id: b.id_siswa,
                nama: b.siswa?.nama || 'Unknown',
                nisn: b.siswa?.nisn || '-',
                // @ts-ignore
                kelas: b.siswa?.kelas?.nama || '-',
                h: st.h,
                s: st.s,
                i: st.i,
                a: st.a,
                total_absen: st.s + st.i + st.a
            };
        });

        // Sort by Alpha desc (untuk memudahkan monitoring)
        stats.sort((a, b) => b.a - a.a);

        setStudentStats(stats);
        setSummary({ hadir: totalH, sakit: totalS, izin: totalI, alpha: totalA });

      } catch (error) {
        console.error("Error fetching report:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser.id, filterType, selectedMonth]);

  // Handle View Detail (Modal)
  const handleViewDetail = async (student: StudentStat) => {
      setSelectedStudent(student);
      setShowModal(true);
      setLoadingDetail(true);

      try {
          // Note: Detail di modal menampilkan "Sejarah Lengkap" (All time) atau mengikuti filter? 
          // Agar konsisten dengan UI PDF, kita terapkan filter yang sama.
          
          let pelQuery = supabase
            .from('pelanggaran')
            .select('*')
            .eq('id_siswa', student.id)
            .eq('id_guru', currentUser.id)
            .order('tanggal', { ascending: false });

          let presQuery = supabase
            .from('prestasi')
            .select('*')
            .eq('id_siswa', student.id)
            .eq('id_guru', currentUser.id)
            .order('tanggal', { ascending: false });

          // Terapkan Filter Tanggal jika ada
          if (filterType === 'MONTH' && selectedMonth) {
                const [year, month] = selectedMonth.split('-');
                const startDate = `${year}-${month}-01`;
                const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
                
                pelQuery = pelQuery.gte('tanggal', startDate).lte('tanggal', endDate);
                presQuery = presQuery.gte('tanggal', startDate).lte('tanggal', endDate);
          }

          const [pelRes, presRes] = await Promise.all([pelQuery, presQuery]);

          setDetailRecords({
              // @ts-ignore
              pelanggaran: pelRes.data || [],
              // @ts-ignore
              prestasi: presRes.data || []
          });

      } catch (e) {
          console.error(e);
      } finally {
          setLoadingDetail(false);
      }
  };

  // --- PDF GENERATION LOGIC ---
  const handleDownloadPDF = async (student: StudentStat, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent opening modal
      setPdfLoadingId(student.id);

      try {
          // 1. Fetch additional data (Violations & Achievements) with filters
          let pelQuery = supabase
            .from('pelanggaran')
            .select('*')
            .eq('id_siswa', student.id)
            .eq('id_guru', currentUser.id)
            .order('tanggal', { ascending: false });

          let presQuery = supabase
            .from('prestasi')
            .select('*')
            .eq('id_siswa', student.id)
            .eq('id_guru', currentUser.id)
            .order('tanggal', { ascending: false });

          if (filterType === 'MONTH' && selectedMonth) {
                const [year, month] = selectedMonth.split('-');
                const startDate = `${year}-${month}-01`;
                const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
                pelQuery = pelQuery.gte('tanggal', startDate).lte('tanggal', endDate);
                presQuery = presQuery.gte('tanggal', startDate).lte('tanggal', endDate);
          }

          const [pelRes, presRes] = await Promise.all([pelQuery, presQuery]);
          const violations = pelRes.data || [];
          const achievements = presRes.data || [];

          // 2. Setup PDF
          const doc = new jsPDF();
          const pageWidth = doc.internal.pageSize.getWidth();
          let yPos = 15;

          // --- KOP SURAT ---
          // Logo (Optional: Try to add if URL exists)
          if (sekolah.logo_url) {
              try {
                  // Simple approach: Add image from URL. 
                  // Note: This might fail if CORS is not configured on the image server.
                  // Ideally, use a base64 string or ensure CORS is allowed.
                  // Using a try-catch to prevent PDF failure if image fails.
                  const imgProps = { x: 15, y: 10, w: 20, h: 20 };
                  doc.addImage(sekolah.logo_url, 'PNG', imgProps.x, imgProps.y, imgProps.w, imgProps.h);
              } catch (err) {
                  // Ignore image error, proceed with text
                  console.warn("Could not load logo into PDF", err);
              }
          }

          // School Identity
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text((sekolah.nama || "SEKOLAH ...").toUpperCase(), pageWidth / 2, yPos, { align: "center" });
          
          yPos += 6;
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.text(`NPSN: ${sekolah.npsn || '-'}`, pageWidth / 2, yPos, { align: "center" });
          
          yPos += 5;
          doc.text(sekolah.alamat || "Alamat Sekolah...", pageWidth / 2, yPos, { align: "center" });
          
          yPos += 5;
          doc.text(`Telp: ${sekolah.no_telp || '-'} | Email: ${sekolah.email || '-'}`, pageWidth / 2, yPos, { align: "center" });
          
          yPos += 5;
          doc.setLineWidth(0.5);
          doc.line(10, yPos, pageWidth - 10, yPos); // Garis Kop

          // --- TITLE ---
          yPos += 15;
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text("LAPORAN PERKEMBANGAN SISWA", pageWidth / 2, yPos, { align: "center" });
          
          yPos += 6;
          doc.setFontSize(10);
          doc.setFont("helvetica", "italic");
          doc.text(`Periode: ${getPeriodLabel()}`, pageWidth / 2, yPos, { align: "center" });

          // --- STUDENT INFO ---
          yPos += 15;
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          
          const leftCol = 20;
          const rightCol = 110;
          
          doc.text(`Nama Siswa  : ${student.nama}`, leftCol, yPos);
          doc.text(`NISN        : ${student.nisn}`, leftCol, yPos + 6);
          
          doc.text(`Kelas       : ${student.kelas}`, rightCol, yPos);
          doc.text(`Guru Wali   : ${currentUser.nama}`, rightCol, yPos + 6);

          yPos += 15;

          // --- 1. RINGKASAN KEHADIRAN ---
          doc.setFont("helvetica", "bold");
          doc.text("A. RINGKASAN KEHADIRAN", 20, yPos);
          yPos += 3;

          autoTable(doc, {
              startY: yPos,
              head: [['Keterangan', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Total Absen']],
              body: [[
                  'Jumlah', 
                  student.h + ' Hari', 
                  student.s + ' Hari', 
                  student.i + ' Hari', 
                  student.a + ' Hari',
                  student.total_absen + ' Hari'
              ]],
              theme: 'grid',
              headStyles: { fillColor: [55, 65, 81] }, // Dark Gray
              styles: { halign: 'center' },
              columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
              margin: { left: 20, right: 20 }
          });

          // @ts-ignore
          yPos = doc.lastAutoTable.finalY + 15;

          // --- 2. CATATAN PELANGGARAN ---
          doc.text("B. RIWAYAT PELANGGARAN", 20, yPos);
          yPos += 3;

          if (violations.length > 0) {
              const violationRows = violations.map((v, idx) => [
                  idx + 1,
                  v.tanggal,
                  v.deskripsi,
                  v.tindakan || '-'
              ]);

              autoTable(doc, {
                  startY: yPos,
                  head: [['No', 'Tanggal', 'Pelanggaran', 'Tindakan/Sanksi']],
                  body: violationRows,
                  theme: 'grid',
                  headStyles: { fillColor: [220, 38, 38] }, // Red
                  margin: { left: 20, right: 20 }
              });
          } else {
              doc.setFont("helvetica", "italic");
              doc.setFontSize(9);
              doc.text("Tidak ada catatan pelanggaran pada periode ini.", 20, yPos + 6);
              doc.setFont("helvetica", "bold");
              doc.setFontSize(10);
              yPos += 5; // Adjustment if no table
          }

          // @ts-ignore
          yPos = (doc.lastAutoTable?.finalY || yPos) + 15;

          // --- 3. CATATAN PRESTASI ---
          doc.text("C. RIWAYAT PRESTASI", 20, yPos);
          yPos += 3;

          if (achievements.length > 0) {
              const achievementRows = achievements.map((p, idx) => [
                  idx + 1,
                  p.tanggal,
                  p.deskripsi,
                  p.tingkat || '-'
              ]);

              autoTable(doc, {
                  startY: yPos,
                  head: [['No', 'Tanggal', 'Prestasi', 'Tingkat']],
                  body: achievementRows,
                  theme: 'grid',
                  headStyles: { fillColor: [5, 150, 105] }, // Green
                  margin: { left: 20, right: 20 }
              });
          } else {
              doc.setFont("helvetica", "italic");
              doc.setFontSize(9);
              doc.text("Tidak ada catatan prestasi pada periode ini.", 20, yPos + 6);
          }

          // --- SIGNATURE ---
          // @ts-ignore
          let finalY = (doc.lastAutoTable?.finalY || yPos) + 25;
          
          // Check for page break possibility
          if (finalY > 250) {
              doc.addPage();
              finalY = 40;
          }

          const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          
          doc.text(`...................., ${dateStr}`, 140, finalY);
          finalY += 6;
          doc.text("Wali Kelas,", 140, finalY);
          
          finalY += 25;
          doc.setFont("helvetica", "bold");
          doc.text(currentUser.nama, 140, finalY);
          finalY += 5;
          doc.setFont("helvetica", "normal");
          doc.text(`NIP. ${currentUser.nip || '....................'}`, 140, finalY);

          // Save
          const safeName = student.nama.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          doc.save(`Laporan_Binaan_${safeName}_${getPeriodLabel().replace(/\s+/g, '_')}.pdf`);

      } catch (err) {
          console.error(err);
          alert('Gagal membuat PDF. Coba lagi.');
      } finally {
          setPdfLoadingId(null);
      }
  };

  // Data Chart Ringkasan
  const chartDataSummary = [
    { name: 'Hadir', jumlah: summary.hadir, fill: '#10B981' },
    { name: 'Sakit', jumlah: summary.sakit, fill: '#F59E0B' },
    { name: 'Izin', jumlah: summary.izin, fill: '#3B82F6' },
    { name: 'Alpha', jumlah: summary.alpha, fill: '#EF4444' },
  ];

  // Data Chart Top 5 Alpha
  const chartDataAlpha = studentStats
    .filter(s => s.a > 0)
    .slice(0, 5)
    .map(s => ({
        name: s.nama.split(' ')[0], // Nama depan saja biar muat
        full_name: s.nama,
        alpha: s.a
    }));

  const getPeriodLabel = () => {
      if (filterType === 'ALL') return "Semua Waktu";
      if (!selectedMonth) return "-";
      const [year, month] = selectedMonth.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  };

  const handleExport = () => {
    if (studentStats.length === 0) return;

    // 1. Tentukan Nama File berdasarkan Filter
    let filename = 'Laporan_Binaan_Semua_Waktu';
    if (filterType === 'MONTH' && selectedMonth) {
        const [y, m] = selectedMonth.split('-');
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const monthName = monthNames[parseInt(m) - 1];
        filename = `Laporan_Binaan_${monthName}_${y}`;
    }

    // 2. Siapkan Data Siswa
    const dataToExport = studentStats.map((s, index) => ({
        No: index + 1,
        Periode: getPeriodLabel(),
        NISN: s.nisn ? `'${s.nisn}` : '-', // Format text untuk Excel
        Nama: s.nama,
        Kelas: s.kelas,
        Hadir: s.h,
        Sakit: s.s,
        Izin: s.i,
        Alpha: s.a,
        'Total Ketidakhadiran': s.total_absen,
        'Status': s.a > 10 ? 'PERINGATAN (Alpha > 10)' : 'Aman'
    }));

    // 3. Tambahkan Baris Summary Total di Bawah
    const summaryRow = {
        No: '',
        Periode: '',
        NISN: '',
        Nama: 'TOTAL KESELURUHAN',
        Kelas: '',
        Hadir: summary.hadir,
        Sakit: summary.sakit,
        Izin: summary.izin,
        Alpha: summary.alpha,
        'Total Ketidakhadiran': summary.sakit + summary.izin + summary.alpha,
        'Status': ''
    };
    
    // @ts-ignore
    dataToExport.push(summaryRow);

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    link.setAttribute('download', `${filename}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-white">Laporan Perkembangan Siswa</h2>
            <p className="text-gray-400 text-sm">Rekapitulasi kehadiran siswa binaan.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
             {/* Filter Control */}
             <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                <button 
                    onClick={() => setFilterType('ALL')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${filterType === 'ALL' ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    Semua
                </button>
                <button 
                    onClick={() => setFilterType('MONTH')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${filterType === 'MONTH' ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    Per Bulan
                </button>
             </div>

             {filterType === 'MONTH' && (
                 <input 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                 />
             )}

            <button 
                onClick={handleExport} 
                disabled={loading || studentStats.length === 0} 
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2 font-medium shadow-lg disabled:opacity-50"
            >
                <span>📊</span> <span className="hidden md:inline">Export CSV</span>
            </button>
        </div>
      </div>

      {loading ? (
          <div className="flex justify-center py-20">
              <span className="text-gray-400 animate-pulse">Sedang menghitung data...</span>
          </div>
      ) : (
        <>
            {/* Periode Info Banner */}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 text-center md:text-left flex flex-col md:flex-row justify-between items-center">
                <span className="text-blue-300 text-sm">
                    Menampilkan data periode: <strong className="text-white ml-1">{getPeriodLabel()}</strong>
                </span>
                <span className="text-xs text-blue-400 mt-1 md:mt-0">
                    Total Siswa: {studentStats.length}
                </span>
            </div>

            {/* 1. Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">✅</div>
                    <p className="text-gray-400 text-sm font-medium uppercase">Total Hadir</p>
                    <p className="text-3xl font-bold text-green-500 mt-1">{summary.hadir}</p>
                </div>
                <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">🤒</div>
                    <p className="text-gray-400 text-sm font-medium uppercase">Total Sakit</p>
                    <p className="text-3xl font-bold text-yellow-500 mt-1">{summary.sakit}</p>
                </div>
                <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">📩</div>
                    <p className="text-gray-400 text-sm font-medium uppercase">Total Izin</p>
                    <p className="text-3xl font-bold text-blue-500 mt-1">{summary.izin}</p>
                </div>
                <div className="bg-gray-800 p-5 rounded-xl border border-red-500/30 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">❌</div>
                    <p className="text-gray-400 text-sm font-medium uppercase">Total Alpha</p>
                    <p className="text-3xl font-bold text-red-500 mt-1">{summary.alpha}</p>
                </div>
            </div>

            {/* 2. Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart Ringkasan */}
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        📊 Statistik Keseluruhan
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartDataSummary}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="name" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6', borderRadius: '8px' }} 
                                />
                                <Bar dataKey="jumlah" radius={[6, 6, 0, 0]} barSize={50} animationDuration={1500}>
                                    {chartDataSummary.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart Top Alpha */}
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
                    <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                        ⚠️ Top 5 Siswa Sering Alpha
                    </h3>
                    <p className="text-xs text-gray-400 mb-6">
                        Siswa dengan alpha terbanyak pada periode: <span className="text-red-400">{getPeriodLabel()}</span>
                    </p>
                    
                    {chartDataAlpha.length > 0 ? (
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartDataAlpha} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={true} vertical={false} />
                                    <XAxis type="number" stroke="#9CA3AF" />
                                    <YAxis dataKey="name" type="category" stroke="#9CA3AF" width={80} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#EF4444', color: '#F3F4F6', borderRadius: '8px' }}
                                        formatter={(value: any, name: any, props: any) => [value, `Alpha (${props.payload.full_name})`]}
                                    />
                                    <Bar dataKey="alpha" fill="#EF4444" radius={[0, 6, 6, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-gray-500 italic border-2 border-dashed border-gray-700 rounded-lg">
                            Tidak ada data alpha pada periode ini.
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Detailed Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
                <div className="p-6 border-b border-gray-700">
                    <h3 className="text-lg font-bold text-white">Daftar Rincian Kehadiran Siswa</h3>
                    <p className="text-xs text-gray-400 mt-1">Klik pada nama siswa untuk melihat detail, atau gunakan tombol Aksi untuk download PDF.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-750">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Siswa</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-green-400 uppercase tracking-wider">Hadir</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-yellow-400 uppercase tracking-wider">Sakit</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-blue-400 uppercase tracking-wider">Izin</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-red-400 uppercase tracking-wider">Alpha</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-gray-300 uppercase tracking-wider">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {studentStats.map((student) => {
                                const isDanger = student.a > 10;
                                return (
                                    <tr key={student.id} className={`transition-colors ${isDanger ? 'bg-red-900/20 hover:bg-red-900/30' : 'hover:bg-gray-750'}`}>
                                        <td 
                                            onClick={() => handleViewDetail(student)}
                                            className="px-6 py-4 whitespace-nowrap cursor-pointer group"
                                        >
                                            <div className={`text-sm font-bold group-hover:underline group-hover:text-blue-400 decoration-dotted underline-offset-4 transition-all ${isDanger ? 'text-red-400' : 'text-white'}`}>
                                                {student.nama}
                                            </div>
                                            <div className="text-xs text-gray-500 group-hover:text-blue-300">
                                                {student.nisn} <span className="text-gray-600">• Klik untuk detail</span>
                                            </div>
                                        </td>
                                        
                                        {/* Simple Bar Visualization in Cell */}
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm font-bold text-green-500">{student.h}</span>
                                            <div className="w-full bg-gray-700 h-1.5 rounded-full mt-1 overflow-hidden">
                                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min((student.h / 30) * 100, 100)}%` }}></div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm font-bold text-yellow-500">{student.s}</span>
                                            {student.s > 0 && <div className="w-full bg-gray-700 h-1.5 rounded-full mt-1 overflow-hidden">
                                                <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: `${Math.min(student.s * 10, 100)}%` }}></div>
                                            </div>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm font-bold text-blue-500">{student.i}</span>
                                            {student.i > 0 && <div className="w-full bg-gray-700 h-1.5 rounded-full mt-1 overflow-hidden">
                                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(student.i * 10, 100)}%` }}></div>
                                            </div>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-sm font-bold ${isDanger ? 'text-red-400 text-lg' : 'text-red-500'}`}>{student.a}</span>
                                            {student.a > 0 && <div className="w-full bg-gray-700 h-1.5 rounded-full mt-1 overflow-hidden">
                                                <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${Math.min(student.a * 5, 100)}%` }}></div>
                                            </div>}
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {isDanger ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse shadow-red-500/50 shadow-md">
                                                    ⚠️ PERINGATAN
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900 text-green-300 border border-green-700">
                                                    Aman
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <button 
                                                onClick={(e) => handleDownloadPDF(student, e)}
                                                disabled={pdfLoadingId === student.id}
                                                className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full shadow-lg transition-transform hover:scale-110 disabled:opacity-50"
                                                title="Download Laporan PDF"
                                            >
                                                {pdfLoadingId === student.id ? (
                                                    <span className="block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                ) : (
                                                    <span>📄</span>
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {studentStats.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500 italic">
                                        Tidak ada siswa binaan yang ditemukan.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL DETAIL SISWA */}
            {showModal && selectedStudent && (
                <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl p-0 border border-gray-700 max-h-[90vh] flex flex-col animate-bounce-in">
                        {/* Header Modal */}
                        <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-750 rounded-t-xl flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-bold text-white">{selectedStudent.nama}</h3>
                                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-400">
                                    <span className="flex items-center gap-1">🆔 {selectedStudent.nisn}</span>
                                    <span className="flex items-center gap-1">🏫 Kelas {selectedStudent.kelas}</span>
                                    <span className="flex items-center gap-1 text-blue-400 font-medium">👨‍🏫 Wali: {currentUser.nama}</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 w-8 h-8 rounded-full flex items-center justify-center transition"
                            >
                                &times;
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                            
                            {/* Section 1: Ringkasan Kehadiran */}
                            <div>
                                <h4 className="text-lg font-bold text-white mb-3 border-l-4 border-blue-500 pl-3">
                                    📊 Ringkasan Kehadiran
                                    <span className="text-xs font-normal text-gray-500 ml-2">({getPeriodLabel()})</span>
                                </h4>
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="bg-green-900/20 border border-green-800 p-3 rounded text-center">
                                        <span className="block text-2xl font-bold text-green-400">{selectedStudent.h}</span>
                                        <span className="text-xs text-green-200 uppercase">Hadir</span>
                                    </div>
                                    <div className="bg-yellow-900/20 border border-yellow-800 p-3 rounded text-center">
                                        <span className="block text-2xl font-bold text-yellow-400">{selectedStudent.s}</span>
                                        <span className="text-xs text-yellow-200 uppercase">Sakit</span>
                                    </div>
                                    <div className="bg-blue-900/20 border border-blue-800 p-3 rounded text-center">
                                        <span className="block text-2xl font-bold text-blue-400">{selectedStudent.i}</span>
                                        <span className="text-xs text-blue-200 uppercase">Izin</span>
                                    </div>
                                    <div className="bg-red-900/20 border border-red-800 p-3 rounded text-center">
                                        <span className="block text-2xl font-bold text-red-400">{selectedStudent.a}</span>
                                        <span className="text-xs text-red-200 uppercase">Alpha</span>
                                    </div>
                                </div>
                            </div>

                            {loadingDetail ? (
                                <div className="text-center py-10 text-gray-500">Memuat detail prestasi & pelanggaran...</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    {/* Section 2: Pelanggaran */}
                                    <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                                        <h4 className="text-md font-bold text-red-400 mb-3 flex items-center gap-2">
                                            ⚠️ Riwayat Pelanggaran
                                            <span className="bg-red-900/50 text-red-200 px-2 py-0.5 rounded-full text-xs">
                                                {detailRecords.pelanggaran.length}
                                            </span>
                                        </h4>
                                        <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                            {detailRecords.pelanggaran.length > 0 ? (
                                                detailRecords.pelanggaran.map(pel => (
                                                    <div key={pel.id} className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
                                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                            <span>{pel.tanggal}</span>
                                                            <span className="text-red-400">Sanksi: {pel.tindakan || '-'}</span>
                                                        </div>
                                                        <p className="text-gray-200">{pel.deskripsi}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-gray-500 italic text-center py-4">Tidak ada catatan pelanggaran.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Section 3: Prestasi */}
                                    <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                                        <h4 className="text-md font-bold text-green-400 mb-3 flex items-center gap-2">
                                            🏆 Riwayat Prestasi
                                            <span className="bg-green-900/50 text-green-200 px-2 py-0.5 rounded-full text-xs">
                                                {detailRecords.prestasi.length}
                                            </span>
                                        </h4>
                                        <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                            {detailRecords.prestasi.length > 0 ? (
                                                detailRecords.prestasi.map(pres => (
                                                    <div key={pres.id} className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
                                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                            <span>{pres.tanggal}</span>
                                                            <span className="text-yellow-400 font-bold">{pres.tingkat}</span>
                                                        </div>
                                                        <p className="text-gray-200 font-medium">{pres.deskripsi}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-gray-500 italic text-center py-4">Tidak ada catatan prestasi.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-800 border-t border-gray-700 rounded-b-xl flex justify-end">
                            <button 
                                onClick={() => setShowModal(false)}
                                className="px-5 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
      )}
    </div>
  );
};