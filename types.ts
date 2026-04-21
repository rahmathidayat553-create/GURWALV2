
export interface Guru {
  id: string;
  nip: string | null;
  nama: string;
  jenis_kelamin: 'L' | 'P' | null;
  no_hp: string | null;
  username: string;
  password?: string;
  peran: string;
  created_at?: string;
}

export interface Siswa {
  id: string;
  nisn: string;
  nama: string;
  jenis_kelamin: 'L' | 'P' | null;
  tanggal_lahir: string | null;
  no_hp: string | null;
  id_kelas: string | null;
  created_at?: string;
  kelas?: {
    nama: string;
  } | null;
}

export interface Kelas {
  id: string;
  kode: string;
  nama: string;
}

export interface Mapel {
  id: string;
  kode: string;
  nama: string;
}

export interface Bimbingan {
  id: string;
  id_guru: string;
  id_siswa: string;
  siswa?: Siswa;
}

export interface Kehadiran {
  id: string;
  id_siswa: string;
  id_guru: string;
  tanggal: string;
  status: 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPHA';
  catatan?: string;
  siswa?: Siswa; // For join
}

export interface Pelanggaran {
  id: string;
  id_siswa: string;
  id_guru: string;
  deskripsi: string;
  tindakan?: string;
  tanggal: string;
  siswa?: Siswa; // For join
}

export interface Prestasi {
  id: string;
  id_siswa: string;
  id_guru: string;
  deskripsi: string;
  tingkat?: string;
  tanggal: string;
  siswa?: Siswa; // For join
}

export interface Pengajaran {
  id: string;
  id_guru: string;
  id_mapel: string;
  id_kelas: string;
  mapel?: Mapel;
  kelas?: Kelas;
  guru?: Guru; // For join
}

export interface Nilai {
  id: string;
  id_siswa: string;
  id_guru: string;
  id_mapel: string;
  jenis: 'FORMATIF' | 'SUMATIF' | 'AKHIR_SUMATIF';
  nilai: number;
  materi?: string; // Atribut Baru
  tanggal: string;
  siswa?: Siswa;
}

export interface Sekolah {
  id: string; // UUID
  nama: string;
  npsn: string | null;
  alamat: string | null;
  email: string | null;
  no_telp: string | null;
  logo_url: string | null;
  hari_sekolah: number; // 5 atau 6
  latitude: number | null;
  longitude: number | null;
}

export interface KalenderPendidikan {
  id: string;
  tanggal: string;
  jenis: 'LIBUR_NASIONAL' | 'LIBUR_SEKOLAH' | 'CUTI_BERSAMA';
  keterangan: string | null;
  created_at?: string;
}

export type ViewState = 
  // Admin
  | 'DASHBOARD' 
  | 'GURU' 
  | 'SISWA' 
  | 'KELAS' 
  | 'MAPEL'
  | 'KALENDER_PENDIDIKAN' // NEW
  | 'ANGGOTA_GURWAL' 
  | 'DATA_PENGAJAR'
  | 'INPUT_KEHADIRAN_ADMIN'
  | 'REKAP_KEHADIRAN'
  | 'PENGATURAN_SEKOLAH'
  | 'PANDUAN_ADMIN'
  | 'CEK_UPDATE' // NEW LINK
  // Unified Guru (Binaan + Pengajar)
  | 'GURU_DASHBOARD'
  | 'PANDUAN_GURU'
  | 'GURU_BINAAN_LIST'
  | 'GURU_BINAAN_KEHADIRAN'
  | 'GURU_IMPORT_KEHADIRAN'
  | 'GURU_BINAAN_PELANGGARAN'
  | 'GURU_BINAAN_PRESTASI'
  | 'GURU_BINAAN_LAPORAN'
  | 'GURU_PENGAJAR_JADWAL'
  | 'GURU_PENGAJAR_NILAI'
  | 'GURU_PENGAJAR_REKAP';