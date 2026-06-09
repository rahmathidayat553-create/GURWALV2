
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSekolah } from '../hooks/useSekolah';
import { db } from '../firebaseClient';
import { doc, writeBatch } from 'firebase/firestore';

interface MissingRecord {
  tanggal: string;
  nama_siswa: string;
  kelas: string;
  nama_guru: string; // Nama Wali (jika ada)
}

interface GroupedMissing {
  kelas: string;
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
  const [backupLoading, setBackupLoading] = useState(false);

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

  // --- LOGIC MONITORING REFACTORED (SISWA-CENTRIC) ---
  const handleCheckCompleteness = async () => {
    setMonitorLoading(true);
    setCheckPerformed(false);
    setMissingData([]);

    try {
        // 1. Get Settings (Hari Sekolah)
        const { data: sekolah } = await supabase.from('sekolah').select('hari_sekolah').limit(1).maybeSingle();
        const hariSekolah = sekolah?.hari_sekolah || 5;

        // 2. Define Date Boundaries
        const [yearStr, monthStr] = monitorMonth.split('-'); 
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        
        const startDateStr = `${yearStr}-${monthStr}-01`;
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const endDateStr = `${yearStr}-${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`;
        const todayStr = new Date().toISOString().split('T')[0];

        // Tentukan batas akhir (tidak boleh masa depan)
        let checkUntilStr = endDateStr;
        if (todayStr < endDateStr) {
            checkUntilStr = todayStr;
        }

        // Validate range
        if (checkUntilStr < startDateStr) {
            setCheckPerformed(true);
            setMonitorLoading(false);
            setMissingData([]);
            return;
        }

        // 3. Get Holidays
        const { data: holidays } = await supabase
            .from('kalender_pendidikan')
            .select('tanggal')
            .gte('tanggal', startDateStr)
            .lte('tanggal', checkUntilStr);
        
        const holidaySet = new Set(holidays?.map(h => h.tanggal));

        // 4. Generate Valid Active Days
        const validDates: string[] = [];
        let current = new Date(year, month - 1, 1, 12, 0, 0); // Noon to avoid TZ issues
        const checkUntilDate = new Date(checkUntilStr + 'T12:00:00');

        while (current <= checkUntilDate) {
            const day = current.getDay(); // 0=Sun
            const dateStr = current.toISOString().split('T')[0];

            let isSchoolDay = true;
            if (day === 0) isSchoolDay = false;
            if (hariSekolah === 5 && day === 6) isSchoolDay = false;
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

        // 5. GET ALL STUDENTS (Source of Truth)
        // Kita perlu data siswa + kelas + guru wali (jika ada) untuk laporan
        const { data: allStudents } = await supabase
            .from('siswa')
            .select(`
                id, nama, 
                kelas (nama),
                bimbingan (
                    guru (nama)
                )
            `); // Note: bimbingan bisa kosong jika belum diassign

        if (!allStudents || allStudents.length === 0) {
            setCheckPerformed(true);
            setMonitorLoading(false);
            return;
        }

        // 6. GET ATTENDANCE MAP (Based on Siswa ID + Date)
        // Kita ambil *semua* record kehadiran di rentang tanggal valid
        const { data: attendance } = await supabase
            .from('kehadiran')
            .select('id_siswa, tanggal')
            .gte('tanggal', validDates[0])
            .lte('tanggal', validDates[validDates.length - 1]);

        const attendanceSet = new Set(attendance?.map(a => `${a.tanggal}_${a.id_siswa}`));

        // 7. CROSS CHECK
        const missing: MissingRecord[] = [];

        // Loop: Tanggal Aktif -> Siswa
        validDates.forEach(date => {
            allStudents.forEach((student: any) => {
                const key = `${date}_${student.id}`;
                if (!attendanceSet.has(key)) {
                    // Get Guru Wali Name (safely)
                    let namaWali = 'Belum Ada Wali';
                    if (student.bimbingan && student.bimbingan.length > 0 && student.bimbingan[0].guru) {
                        namaWali = student.bimbingan[0].guru.nama;
                    }

                    missing.push({
                        tanggal: date,
                        nama_siswa: student.nama,
                        kelas: student.kelas?.nama || 'Tanpa Kelas',
                        nama_guru: namaWali
                    });
                }
            });
        });

        // 8. Grouping by Kelas (Better for Admin)
        const groupedMap = new Map<string, MissingRecord[]>();
        missing.forEach(item => {
            if (!groupedMap.has(item.kelas)) {
                groupedMap.set(item.kelas, []);
            }
            groupedMap.get(item.kelas)?.push(item);
        });

        const groupedResult: GroupedMissing[] = [];
        groupedMap.forEach((items, kelas) => {
            // Sort by Date then Student Name
            items.sort((a, b) => {
                const dateCompare = a.tanggal.localeCompare(b.tanggal);
                return dateCompare !== 0 ? dateCompare : a.nama_siswa.localeCompare(b.nama_siswa);
            });
            groupedResult.push({ kelas, items });
        });

        // Sort Groups by Class Name
        groupedResult.sort((a, b) => a.kelas.localeCompare(b.kelas));

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
            'Kelas': '-',
            'Nama Guru Wali': '-',
            Status: 'Lengkap'
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
                'Kelas': group.kelas,
                'Nama Guru Wali': item.nama_guru,
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
        ['LAPORAN MONITORING KELENGKAPAN KEHADIRAN (GLOBAL)'],
        [`Periode: ${getPeriodLabel()}`],
        [`Tanggal Export: ${exportDate}`],
        [],
        ['No', 'Tanggal', 'Nama Siswa', 'Kelas', 'Nama Guru Wali', 'Status'],
        ...rows.map(r => [r.No, r.Tanggal, r['Nama Siswa'], r.Kelas, r['Nama Guru Wali'], r.Status])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Merge Cells for Title
    if(!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
    ws['!merges'].push({ s: { r: 3, c: 0 }, e: { r: 3, c: 5 } });

    XLSX.utils.book_append_sheet(wb, ws, "Monitoring Kehadiran");
    XLSX.writeFile(wb, `Monitoring_Kehadiran_${monitorMonth}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

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

    yPos += 15;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("LAPORAN MONITORING KEHADIRAN SISWA", pageWidth / 2, yPos, { align: "center" });
    
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const exportDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Periode Monitoring : ${getPeriodLabel()}`, 14, yPos);
    doc.text(`Waktu Export       : ${exportDate}`, 14, yPos + 5);

    yPos += 10;

    const rows = getExportData();
    const tableBody = rows.map(r => [r.No, r.Tanggal, r['Nama Siswa'], r.Kelas, r['Nama Guru Wali'], r.Status]);

    autoTable(doc, {
        startY: yPos,
        head: [['No', 'Tanggal', 'Nama Siswa', 'Kelas', 'Wali', 'Status']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [55, 65, 81] }, 
        styles: { fontSize: 8 },
        margin: { top: 10, bottom: 20 }
    });

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

  const handleBackupData = async () => {
    setBackupLoading(true);
    try {
      const { data: guru } = await supabase.from('guru').select('*');
      const { data: siswa } = await supabase.from('siswa').select('*');
      const { data: kelas } = await supabase.from('kelas').select('*');
      const { data: mapel } = await supabase.from('mapel').select('*');
      const { data: sekolah } = await supabase.from('sekolah').select('*');
      const { data: bimbingan } = await supabase.from('bimbingan').select('*');
      const { data: pengajaran } = await supabase.from('pengajaran').select('*');
      const { data: kehadiran } = await supabase.from('kehadiran').select('*');
      const { data: pelanggaran } = await supabase.from('pelanggaran').select('*');
      const { data: prestasi } = await supabase.from('prestasi').select('*');
      const { data: nilai } = await supabase.from('nilai').select('*');
      const { data: kalender_pendidikan } = await supabase.from('kalender_pendidikan').select('*');
      
      const backupData = {
        meta: {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          type: 'full_backup'
        },
        collections: {
          guru,
          siswa,
          kelas,
          mapel,
          sekolah,
          bimbingan,
          pengajaran,
          kehadiran,
          pelanggaran,
          prestasi,
          nilai,
          kalender_pendidikan
        }
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `Backup_Migrasi_GurWal_${new Date().getTime()}.json`);
      document.body.appendChild(downloadAnchorNode); 
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      
    } catch (e) {
      console.error("Backup failed", e);
      alert("Gagal melakukan backup data");
    } finally {
      setBackupLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const handleUploadFirebase = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const backupData = JSON.parse(content);

        if (!backupData || !backupData.collections) {
          throw new Error("Format JSON tidak valid");
        }

        const collections = backupData.collections;
        const colNames = Object.keys(collections);

        let totalDocs = 0;
        
        for (const colName of colNames) {
          const items = collections[colName];
          if (!Array.isArray(items) || items.length === 0) continue;

          // Process in batches of 500 (Firestore limit)
          const chunks = [];
          for (let i = 0; i < items.length; i += 500) {
            chunks.push(items.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            for (const item of chunk) {
              const docId = item.id || crypto.randomUUID();
              const docRef = doc(db, colName, docId);
              batch.set(docRef, item);
              totalDocs++;
            }
            await batch.commit();
          }
        }

        alert(`Yeay! Berhasil migrate ${totalDocs} dokumen ke Firebase!`);
      } catch (err) {
        console.error("Migration error:", err);
        alert("Gagal melakukan migrasi ke Firebase. Pastikan file JSON formatnya sesuai.");
      } finally {
        setUploadLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
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

      {/* PLAN MIGRASI - BACKUP DATA */}
      <div className="bg-indigo-900/30 p-6 rounded-lg border border-indigo-700/50 mt-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h3 className="text-xl font-bold text-indigo-400">🗄️ Migrasi Firebase (Tahap 1)</h3>
                <p className="text-indigo-200/70 text-sm mt-1">Lakukan backup data dari Supabase ke file JSON, lalu upload JSON tersebut untuk memasukkan semua data ke Firebase.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
                <button 
                    onClick={handleBackupData} 
                    disabled={backupLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-bold shadow flex items-center justify-center gap-2 disabled:opacity-50 transition"
                >
                    {backupLoading ? 'Mendownload...' : '⬇️ Backup JSON'}
                </button>
                <input 
                  type="file" 
                  accept=".json" 
                  ref={fileInputRef} 
                  onChange={handleUploadFirebase} 
                  className="hidden" 
                />
                <button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={uploadLoading}
                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow flex items-center justify-center gap-2 disabled:opacity-50 transition"
                >
                    {uploadLoading ? 'Mengunggah...' : '🚀 Inject JSON ke Firebase'}
                </button>
            </div>
        </div>
      </div>

      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
                <h3 className="text-xl font-bold text-white">📡 Monitoring Kelengkapan Absensi</h3>
                <p className="text-gray-400 text-sm mt-1">Cek seluruh siswa yang belum memiliki data kehadiran pada hari aktif.</p>
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
                        <p className="text-gray-400 text-sm mt-1">Sistem akan mengecek silang seluruh siswa vs data kehadiran.</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        {checkPerformed && (
                            <>
                                <button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-2 shadow">📊 Excel</button>
                                <button onClick={handleExportPDF} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-2 shadow">📄 PDF</button>
                            </>
                        )}
                        <button onClick={() => setIsMonitorOpen(false)} className="text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 w-8 h-8 rounded-full flex items-center justify-center transition ml-4">&times;</button>
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
                        * Pengecekan berbasis Tabel Siswa (Akurat meski pindah guru).
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-900/50">
                    {monitorLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                            <span className="text-4xl mb-3 animate-spin">⏳</span>
                            <p>Sedang memindai kehadiran seluruh siswa...</p>
                        </div>
                    ) : !checkPerformed ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                            <span className="text-4xl mb-3">📅</span>
                            <p>Pilih bulan dan klik tombol untuk mulai monitoring.</p>
                        </div>
                    ) : missingData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-green-400 bg-green-900/10 border border-green-900/30 rounded-lg">
                            <span className="text-5xl mb-3">🎉</span>
                            <h4 className="text-xl font-bold">Lengkap!</h4>
                            <p className="text-green-300/70 text-sm mt-1">Seluruh siswa memiliki data kehadiran pada bulan ini.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-red-900/20 border border-red-800 p-3 rounded-lg text-red-200 text-sm flex items-center gap-2">
                                <span>⚠️</span> Ditemukan <strong>{missingData.reduce((acc, curr) => acc + curr.items.length, 0)}</strong> siswa belum diabsen pada tanggal tertentu.
                            </div>

                            {missingData.map((group, idx) => (
                                <div key={idx} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                                    <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                                        <h4 className="font-bold text-white flex items-center gap-2">
                                            🏫 Kelas {group.kelas}
                                        </h4>
                                        <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
                                            {group.items.length} Missing
                                        </span>
                                    </div>
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-400 uppercase bg-gray-800 border-b border-gray-700">
                                            <tr>
                                                <th className="px-4 py-2">Tanggal</th>
                                                <th className="px-4 py-2">Nama Siswa</th>
                                                <th className="px-4 py-2">Guru Wali</th>
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
                                                    <td className="px-4 py-2 text-gray-400 text-xs italic">
                                                        {item.nama_guru}
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
