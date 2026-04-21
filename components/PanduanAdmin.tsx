import React from 'react';

export const PanduanAdmin: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary/20 text-primary rounded-xl flex items-center justify-center text-3xl">
            📖
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Panduan Penggunaan Sistem</h2>
            <p className="text-gray-400 mt-1">Unduh dokumen panduan lengkap untuk Administrator</p>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="bg-gray-700/50 p-6 rounded-xl border border-gray-600 hover:border-primary/50 transition duration-300">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="text-blue-400">📄</span> Panduan Administrator (PDF)
            </h3>
            <p className="text-sm text-gray-400 mb-6 min-h-[60px]">
              Dokumen lengkap berisi cara penggunaan semua fitur di dashboard Administrator, termasuk manajemen data guru, siswa, kelas, mapel, kalender akademik, dan rekap kehadiran.
            </p>
            <a 
              href="/Panduan_Administrator.pdf" 
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-semibold shadow-lg transition-all transform hover:scale-[1.02]"
              download
            >
              <span>⬇️</span> Unduh Panduan PDF
            </a>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
          <h4 className="text-yellow-500 font-bold flex items-center gap-2 mb-2">
            <span>💡</span> Catatan Penting
          </h4>
          <p className="text-sm text-gray-300">
            Pastikan Anda memiliki aplikasi PDF reader untuk membuka file panduan ini. Pastikan juga file PDF telah diunggah ke dalam folder <code>public/</code> jika Anda menghosting aplikasi ini sendiri.
          </p>
        </div>
      </div>
    </div>
  );
};
