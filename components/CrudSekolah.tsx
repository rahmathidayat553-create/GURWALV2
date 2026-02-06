import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Sekolah } from '../types';

interface CrudSekolahProps {
  showToast: (msg: string, type: 'success' | 'error', duration?: number, position?: 'top-right' | 'center') => void;
}

export const CrudSekolah: React.FC<CrudSekolahProps> = ({ showToast }) => {
  const [loading, setLoading] = useState(false);

  // Initialize with default values
  const [formData, setFormData] = useState<Partial<Sekolah>>({
    nama: '',
    npsn: '',
    alamat: '',
    email: '',
    no_telp: '',
    logo_url: '',
    hari_sekolah: 5, // Default 5 hari
    latitude: null,
    longitude: null
  });

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Mengambil 1 data saja karena singleton
      const { data, error } = await supabase
        .from('sekolah')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;

      if (data) {
        setFormData(data);
      }
    } catch (error: any) {
      console.error('Error fetching data sekolah:', error);
      showToast('Gagal memuat data sekolah', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = value === '' ? null : parseFloat(value);
    setFormData(prev => ({ ...prev, [name]: numValue }));
  };

  const handleRadioChange = (days: number) => {
    setFormData(prev => ({ ...prev, hari_sekolah: days }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // VALIDASI INPUT
    if (!formData.nama) {
        showToast('Nama Sekolah wajib diisi.', 'error');
        return;
    }

    if (formData.latitude && (formData.latitude < -90 || formData.latitude > 90)) {
        showToast('Latitude harus antara -90 dan 90.', 'error');
        return;
    }

    if (formData.longitude && (formData.longitude < -180 || formData.longitude > 180)) {
        showToast('Longitude harus antara -180 dan 180.', 'error');
        return;
    }

    setLoading(true);

    try {
      const payload = {
        nama: formData.nama,
        npsn: formData.npsn || null,
        alamat: formData.alamat || null,
        email: formData.email || null,
        no_telp: formData.no_telp || null,
        logo_url: formData.logo_url || null,
        hari_sekolah: formData.hari_sekolah || 5,
        latitude: formData.latitude,
        longitude: formData.longitude
      };

      let error;

      if (formData.id) {
        // UPDATE Existing
        const { error: updateError } = await supabase
          .from('sekolah')
          .update(payload)
          .eq('id', formData.id);
        error = updateError;
      } else {
        // INSERT New
        const { error: insertError } = await supabase
          .from('sekolah')
          .insert([payload]);
        error = insertError;
      }

      if (error) throw error;

      showToast('✅ Pengaturan sekolah berhasil disimpan!', 'success');
      fetchData(); // Refresh data to get generated ID if insert
    } catch (error: any) {
      console.error('Error saving data:', error);
      showToast('❌ Gagal menyimpan data: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h2 className="text-3xl font-bold text-white mb-2">🏫 Pengaturan Sekolah</h2>
            <p className="text-gray-400">Kelola identitas instansi, jadwal operasional, dan lokasi.</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
        <form onSubmit={handleSubmit}>
          <div className="p-8 space-y-8">
            
            {/* SECTION 1: IDENTITAS & LOGO */}
            <div className="flex flex-col md:flex-row gap-8 items-start border-b border-gray-700 pb-8">
                {/* Logo Preview & Input */}
                <div className="w-full md:w-1/3 flex flex-col items-center">
                    <label className="block text-sm font-medium text-gray-300 mb-3">Logo Sekolah</label>
                    <div className="relative w-48 h-48 bg-gray-900 border-2 border-dashed border-gray-600 rounded-xl flex items-center justify-center overflow-hidden mb-4 shadow-inner">
                        {formData.logo_url ? (
                            <img 
                            src={formData.logo_url} 
                            alt="Logo Sekolah" 
                            className="w-full h-full object-contain p-2"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                            />
                        ) : (
                            <div className="text-center p-4 text-gray-500">
                                <span className="text-5xl block mb-2 opacity-50">🏫</span>
                                <span className="text-xs">Preview Logo</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="w-full">
                        <label className="block text-xs font-medium text-gray-400 mb-1">URL Logo (Link Gambar)</label>
                        <input 
                            type="text" 
                            name="logo_url"
                            value={formData.logo_url || ''}
                            onChange={handleInputChange}
                            placeholder="https://example.com/logo.png"
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2.5 text-white focus:ring-primary focus:border-primary text-sm transition"
                        />
                    </div>
                </div>

                {/* Main Fields */}
                <div className="w-full md:w-2/3 space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-white mb-1">Nama Sekolah <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            name="nama"
                            required
                            value={formData.nama || ''}
                            onChange={handleInputChange}
                            placeholder="Contoh: SMKN 1 NUSANTARA"
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent transition text-lg"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">NPSN</label>
                            <input
                                type="text"
                                name="npsn"
                                value={formData.npsn || ''}
                                onChange={handleInputChange}
                                placeholder="8 Digit Angka"
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Hari Sekolah <span className="text-red-500">*</span></label>
                            <div className="flex gap-4 mt-2">
                                <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition ${formData.hari_sekolah === 5 ? 'bg-primary/20 border-primary text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}>
                                    <input 
                                        type="radio" 
                                        name="hari_sekolah" 
                                        checked={formData.hari_sekolah === 5} 
                                        onChange={() => handleRadioChange(5)}
                                        className="hidden" 
                                    />
                                    <span className="font-bold">5 Hari</span>
                                    <span className="text-xs opacity-70">(Senin-Jumat)</span>
                                </label>
                                <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition ${formData.hari_sekolah === 6 ? 'bg-primary/20 border-primary text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'}`}>
                                    <input 
                                        type="radio" 
                                        name="hari_sekolah" 
                                        checked={formData.hari_sekolah === 6} 
                                        onChange={() => handleRadioChange(6)}
                                        className="hidden" 
                                    />
                                    <span className="font-bold">6 Hari</span>
                                    <span className="text-xs opacity-70">(Senin-Sabtu)</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Alamat Lengkap</label>
                        <textarea
                            name="alamat"
                            rows={3}
                            value={formData.alamat || ''}
                            onChange={handleInputChange}
                            placeholder="Jl. Raya No. 123, Kel. Apa, Kec. Dimana..."
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                        />
                    </div>
                </div>
            </div>

            {/* SECTION 2: KONTAK & LOKASI */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Kontak */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-400 border-b border-gray-700 pb-2 mb-4">📞 Kontak</h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Email Sekolah</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email || ''}
                            onChange={handleInputChange}
                            placeholder="admin@sekolah.sch.id"
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Nomor Telepon</label>
                        <input
                            type="text"
                            name="no_telp"
                            value={formData.no_telp || ''}
                            onChange={handleInputChange}
                            placeholder="021-xxxxxxx"
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                        />
                    </div>
                </div>

                {/* Lokasi */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-green-400 border-b border-gray-700 pb-2 mb-4">📍 Lokasi (Koordinat Maps)</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Latitude</label>
                            <input
                                type="number"
                                step="any"
                                name="latitude"
                                min="-90"
                                max="90"
                                value={formData.latitude ?? ''}
                                onChange={handleNumberChange}
                                placeholder="-6.200000"
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Min: -90, Max: 90</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Longitude</label>
                            <input
                                type="number"
                                step="any"
                                name="longitude"
                                min="-180"
                                max="180"
                                value={formData.longitude ?? ''}
                                onChange={handleNumberChange}
                                placeholder="106.800000"
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-primary focus:border-primary"
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Min: -180, Max: 180</p>
                        </div>
                    </div>
                    <div className="bg-blue-900/20 p-3 rounded border border-blue-800 text-xs text-blue-200">
                        💡 Tips: Koordinat digunakan untuk fitur presensi berbasis lokasi di masa mendatang.
                    </div>
                </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="bg-gray-750 px-8 py-5 rounded-b-lg border-t border-gray-700 flex justify-end">
            <button
                type="submit"
                disabled={loading}
                className="bg-primary hover:bg-secondary text-white font-bold py-3 px-8 rounded-lg shadow-lg flex items-center gap-2 transition disabled:opacity-50 transform hover:scale-[1.02]"
            >
                {loading ? (
                    <>
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Menyimpan...
                    </>
                ) : (
                    <>
                        <span>💾</span> Simpan Pengaturan
                    </>
                )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};