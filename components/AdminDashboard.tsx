import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSekolah } from '../hooks/useSekolah';

interface MissingRecord {
  tanggal: string;
  nama_siswa: string;
  nama_guru: string;
}

interface GroupedMissing {
  guru: string;
  items: MissingRecord[];
}

export const AdminDashboard: React.FC = () => {
  const sekolah = useSekolah();
  
  const [stats, setStats] = useState({ guru: 0, siswa: 0, kelas: 0, mapel: 0 });
  const [loading, setLoading] = useState(true);

  // Monitoring State
  const [monitorMonth, setMonitorMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [checkPerformed, setCheckPerformed] = useState(false);
  const [missingData, setMissingData] = useState<GroupedMissing[]>([]);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false); // State untuk Modal

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const { count: guruCount } = await supabase.from('guru').select('*', { count: 'exact', head: true }).neq('peran', 'ADMIN');
        const { count: siswaCount } = await supabase.from('siswa').select('*', { count: 'exact', head: true });
        const { count: kelasCount } = await supabase.from('kelas').select('*', { count: 'exact', head: true });
        const { count: mapelCount } = await supabase.from('mapel').select('*', { count: 'exact', head: true });

        setStats({
            guru: guruCount || 0,
            siswa: siswaCount || 0,
            kelas: kelasCount || 0,
            mapel: mapelCount || 0
        });
      } catch (error) {
        console.error('Error loading admin stats', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardStats();
  }, []);

  // --- LOGIC MONITORING ---
  const handleCheckCompleteness = async () => {
    setMonitorLoading(true);
    setCheckPerformed(false);
    setMissingData([]);

    try {
        // 1. Get Settings (Hari Sekolah)
        const { data: sekolah } = await supabase.from('sekolah').select('hari_sekolah').limit(1).maybeSingle();
        const hariSekolah = sekolah?.hari_sekolah || 5;

        // 2. Define Date Boundaries (Strict String Logic to avoid Timezone shifts)
        const [yearStr, monthStr] = monitorMonth.split('-'); // e.g., "2026", "01"
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        
        // Awal Bulan (YYYY-MM-01)
        const startDateStr = `${yearStr}-${monthStr}-01`;
        
        // Akhir Bulan (YYYY-MM-LastDay)
        const lastDayOfMonth = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this month
        const endDateStr = `${yearStr}-${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`;
        
        // Hari Ini (YYYY-MM-DD)
        const todayStr = new Date().toISOString().split('T')[0];

        // Tentukan Batas Akhir Pengecekan (Check Until)
        // Default: Akhir Bulan
        let checkUntilStr = endDateStr;

        // Jika Hari Ini LEBIH KECIL dari Akhir Bulan (artinya kita sedang di tengah bulan tsb atau bulan sebelumnya)
        // Maka batasi sampai Hari Ini.
        // Tapi HANYA JIKA Hari Ini >= Awal Bulan (jangan mundur ke bulan sebelumnya jika user pilih bulan depan)
        if (todayStr < endDateStr) {
            checkUntilStr = todayStr;
        }

        // --- GUARD CLAUSE / VALIDASI TAMBAHAN ---
        // Jika batas akhir pengecekan (misal Hari Ini: 26 Jan) LEBIH KECIL dari Tanggal Awal Bulan yg dipilih (misal: 1 Feb)
        // Artinya Admin memilih bulan masa depan. 
        // Maka: Stop proses, return kosong.
        if (checkUntilStr < startDateStr) {
            setCheckPerformed(true);
            setMonitorLoading(false);
            setMissingData([]); // Hasil kosong valid
            return;
        }

        // 3. Get Holidays (Strictly within range)
        const { data: holidays } = await supabase
            .from('kalender_pendidikan')
            .select('tanggal')
            .gte('tanggal', startDateStr)
            .lte('tanggal', checkUntilStr);
        
        const holidaySet = new Set(holidays?.map(h => h.tanggal));

        // 4. Generate Valid Active Days
        const validDates: string[] = [];
        // Loop Date object (set jam 12 siang untuk aman dari shifting)
        let current = new Date(year, month - 1, 1, 12, 0, 0);
        // Parse checkUntilStr untuk limit loop
        const checkUntilDate = new Date(checkUntilStr + 'T12:00:00');

        while (current <= checkUntilDate) {
            const day = current.getDay(); // 0=Sun, 6=Sat
            const dateStr = current.toISOString().split('T')[0];

            let isSchoolDay = true;
            if (day === 0) isSchoolDay = false; // Minggu Libur
            if (hariSekolah === 5 && day === 6) isSchoolDay = false; // Sabtu Libur jika 5 hari
            if (isSchoolDay && !holidaySet.has(dateStr)) {
                validDates.push(dateStr);
            }
            current.setDate(current.getDate() + 1);
        }

        if (validDates.length === 0) {
            setCheckPerformed(true);
            setMonitorLoading(false);
            return;
        }

        // 5. Get All Assignments (Siswa & Guru Wali)
        const { data: assignments } = await supabase
            .from('bimbingan')
            .select('id_siswa, id_guru, siswa(nama), guru(nama)');

        if (!assignments || assignments.length === 0) {
            setCheckPerformed(true);
            setMonitorLoading(false);
            return;
        }

        // 6. Get Existing Attendance (STRICT QUERY BOUNDARIES)
        // Pastikan query dibatasi gte(startDateStr) agar data bulan sebelumnya TIDAK bocor.
        const { data: attendance } = await supabase
            .from('kehadiran')
            .select('id_siswa, tanggal')
            .gte('tanggal', validDates[0]) // Minimal tanggal valid pertama
            .lte('tanggal', validDates[validDates.length - 1]); // Maksimal tanggal valid terakhir

        // Buat Set untuk lookup cepat: "YYYY-MM-DD_ID_SISWA"
        const attendanceSet = new Set(attendance?.map(a => `${a.tanggal}_${a.id_siswa}`));

        // 7. Cross Check
        const missing: MissingRecord[] = [];

        // Loop Tanggal Aktif -> Loop Siswa Binaan
        validDates.forEach(date => {
            // @ts-ignore
            assignments.forEach((b: any) => {
                const key = `${date}_${b.id_siswa}`;
                if (!attendanceSet.has(key)) {
                    missing.push({
                        tanggal: date,
                        nama_siswa: b.siswa?.nama || 'Unknown',
                        nama_guru: b.guru?.nama || 'Unknown'
                    });
                }
            });
        });

        // 8. Grouping by Guru
        const groupedMap = new Map<string, MissingRecord[]>();
        missing.forEach(item => {
            if (!groupedMap.has(item.nama_guru)) {
                groupedMap.set(item.nama_guru, []);
            }
            groupedMap.get(item.nama_guru)?.push(item);
        });

        // Sort by Date inside groups
        const groupedResult: GroupedMissing[] = [];
        groupedMap.forEach((items, guru) => {
            items.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
            groupedResult.push({ guru, items });
        });

        // Sort Groups by Guru Name
        groupedResult.sort((a, b) => a.guru.localeCompare(b.guru));

        setMissingData(groupedResult);
        setCheckPerformed(true);

    } catch (error) {
        console.error("Error monitoring:", error);
    } finally {
        setMonitorLoading(false);
    }
  };

  // --- EXPORT LOGIC ---
  const getExportData = () => {
    if (missingData.length === 0) {
        return [{
            No: 1,
            Tanggal: '-',
            'Nama Siswa': '-',
            'Nama Guru Wali': '-',
            Status: 'Tidak ada data kehadiran yang belum diinput pada periode ini'
        }];
    }

    let counter = 1;
    const flatRows: any[] = [];
    missingData.forEach(group => {
        group.items.forEach(item => {
            flatRows.push({
                No: counter++,
                Tanggal: item.tanggal,
                'Nama Siswa': item.nama_siswa,
                'Nama Guru Wali': group.guru,
                Status: 'Belum Input'
            });
        });
    });
    return flatRows;
  };

  const getPeriodLabel = () => {
    const [year, month] = monitorMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  };

  const handleExportExcel = () => {
    const rows = getExportData();
    const exportDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Header Laporan
    const wsData = [
        [(sekolah.nama || 'SEKOLAH ...').toUpperCase()],
        [`NPSN: ${sekolah.npsn || '-'} | Alamat: ${sekolah.alamat || '-'}`],
        [], // Spacing
        ['LAPORAN MONITORING KELENGKAPAN KEHADIRAN GURU WALI'],
        [`Periode: ${getPeriodLabel()}`],
        [`Tanggal Export: ${exportDate}`],
        [],
        ['No', 'Tanggal', 'Nama Siswa', 'Nama Guru Wali', 'Status'], // Table Header
        ...rows.map(r => [r.No, r.Tanggal, r['Nama Siswa'], r['Nama Guru Wali'], r.Status])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Merge Cells for Title
    if(!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }); // School Name
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }); // Address
    ws['!merges'].push({ s: { r: 3, c: 0 }, e: { r: 3, c: 4 } }); // Report Title

    // Add Sheet
    XLSX.utils.book_append_sheet(wb, ws, "Monitoring Kehadiran");
    XLSX.writeFile(wb, `Monitoring_Kehadiran_${monitorMonth}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // --- KOP SURAT ---
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
    doc.setLineWidth(0.5);
    doc.line(10, yPos, pageWidth - 10, yPos);

    // --- JUDUL & METADATA ---
    yPos += 15;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("LAPORAN MONITORING KEHADIRAN GURU WALI", pageWidth / 2, yPos, { align: "center" });
    
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const exportDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Periode Monitoring : ${getPeriodLabel()}`, 14, yPos);
    doc.text(`Waktu Export       : ${exportDate}`, 14, yPos + 5);

    yPos += 10;

    // --- TABLE ---
    const rows = getExportData();
    const tableBody = rows.map(r => [r.No, r.Tanggal, r['Nama Siswa'], r['Nama Guru Wali'], r.Status]);

    autoTable(doc, {
        startY: yPos,
        head: [['No', 'Tanggal', 'Nama Siswa', 'Nama Guru Wali', 'Status']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [55, 65, 81] }, // Dark Gray
        styles: { fontSize: 9 },
        margin: { top: 10, bottom: 20 }
    });

    // --- FOOTER ---
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('Diekspor oleh Sistem GurWal', 14, doc.internal.pageSize.getHeight() - 10);
        doc.text(`Dicetak pada: ${exportDate}`, pageWidth - 60, doc.internal.pageSize.getHeight() - 10);
    }

    doc.save(`Monitoring_Kehadiran_${monitorMonth}.pdf`);
  };

  const Card = ({ title, count, color, icon }: any) => (
    <div className={`bg-gray-800 p-6 rounded-lg shadow border-l-4 ${color} flex items-center justify-between`}>
      <div>
        <h3 className="text-gray-400 text-sm font-medium uppercase">{title}</h3>
        <p className="text-3xl font-bold text-white mt-1">{loading ? '...' : count}</p>
      </div>
      <div className="text-3xl opacity-50">{icon}</div>
    </div>
  );

  return (
    <div className="p-4 space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Dashboard Administrator</h2>
        <p className="text-gray-400">Ringkasan data sistem dan alat monitoring.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card title="Total Guru" count={stats.guru} icon="👩‍🏫" color="border-blue-500" />
        <Card title="Total Siswa" count={stats.siswa} icon="🎓" color="border-green-500" />
        <Card title="Jumlah Kelas" count={stats.kelas} icon="🏫" color="border-purple-500" />
        <Card title="Mata Pelajaran" count={stats.mapel} icon="📘" color="border-yellow-500" />
      </div>

      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
                <h3 className="text-xl font-bold text-white">📡 Monitoring Kelengkapan Absensi</h3>
                <p className="text-gray-400 text-sm mt-1">Cek guru wali yang belum mengisi absensi pada hari aktif.</p>
            </div>
            <div>
                <button 
                    onClick={() => setIsMonitorOpen(true)} 
                    className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded font-bold shadow-lg flex items-center gap-2"
                >
                    🔍 Buka Panel Monitoring
                </button>
            </div>
        </div>
      </div>

      {/* --- MODAL MONITORING --- */}
      {isMonitorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-5xl max-h-[90vh] flex flex-col animate-bounce-in">
                {/* Header */}
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-xl">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <span>🕵️</span> Monitoring Kelengkapan Input
                        </h3>
                        <p className="text-gray-400 text-sm mt-1">Cek data kehadiran yang BELUM diinput.</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        {/* EXPORT BUTTONS (Only if Check Performed) */}
                        {checkPerformed && (
                            <>
                                <button 
                                    onClick={handleExportExcel}
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-2 shadow"
                                    title="Export Excel"
                                >
                                    📊 Excel
                                </button>
                                <button 
                                    onClick={handleExportPDF}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-2 shadow"
                                    title="Export PDF"
                                >
                                    📄 PDF
                                </button>
                            </>
                        )}
                        <button 
                            onClick={() => setIsMonitorOpen(false)}
                            className="text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 w-8 h-8 rounded-full flex items-center justify-center transition ml-4"
                        >
                            &times;
                        </button>
                    </div>
                </div>

                {/* Control Bar */}
                <div className="p-4 bg-gray-750 border-b border-gray-700 flex flex-col md:flex-row gap-4 items-center">
                    <input 
                        type="month"
                        value={monitorMonth}
                        onChange={(e) => setMonitorMonth(e.target.value)}
                        className="bg-gray-700 border border-gray-600 text-white rounded px-3 py-2 text-sm focus:border-blue-500 outline-none w-full md:w-auto"
                    />
                    <button 
                        onClick={handleCheckCompleteness}
                        disabled={monitorLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition w-full md:w-auto justify-center"
                    >
                        {monitorLoading ? 'Memeriksa...' : '🚀 Mulai Pengecekan'}
                    </button>
                    <div className="text-xs text-gray-500 ml-auto hidden md:block text-right">
                        * Pengecekan mengecualikan hari libur & tanggal masa depan.
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-900/50">
                    {monitorLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                            <span className="text-4xl mb-3 animate-spin">⏳</span>
                            <p>Sedang memindai data kehadiran seluruh sekolah...</p>
                        </div>
                    ) : !checkPerformed ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                            <span className="text-4xl mb-3">📅</span>
                            <p>Pilih bulan dan klik tombol untuk mulai monitoring.</p>
                        </div>
                    ) : missingData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-green-400 bg-green-900/10 border border-green-900/30 rounded-lg">
                            <span className="text-5xl mb-3">🎉</span>
                            <h4 className="text-xl font-bold">Semua Lengkap!</h4>
                            <p className="text-green-300/70 text-sm mt-1">Tidak ada data kehadiran yang terlewat pada bulan ini.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-red-900/20 border border-red-800 p-3 rounded-lg text-red-200 text-sm flex items-center gap-2">
                                <span>⚠️</span> Ditemukan <strong>{missingData.reduce((acc, curr) => acc + curr.items.length, 0)}</strong> data belum diinput.
                            </div>

                            {missingData.map((group, idx) => (
                                <div key={idx} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                                    <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                                        <h4 className="font-bold text-white flex items-center gap-2">
                                            👨‍🏫 {group.guru}
                                        </h4>
                                        <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
                                            {group.items.length} Data
                                        </span>
                                    </div>
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-400 uppercase bg-gray-800 border-b border-gray-700">
                                            <tr>
                                                <th className="px-4 py-2">Tanggal</th>
                                                <th className="px-4 py-2">Nama Siswa</th>
                                                <th className="px-4 py-2 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {group.items.map((item, i) => (
                                                <tr key={i} className="hover:bg-gray-700/50">
                                                    <td className="px-4 py-2 text-white font-medium">
                                                        {item.tanggal}
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-300">
                                                        {item.nama_siswa}
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <span className="text-xs font-bold text-red-400 border border-red-900/50 bg-red-900/20 px-2 py-1 rounded">
                                                            Belum Input
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
