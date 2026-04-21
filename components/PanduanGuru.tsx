import React from 'react';

export const PanduanGuru: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary/20 text-primary rounded-xl flex items-center justify-center text-3xl">
            📖
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Panduan Penggunaan Sistem</h2>
            <p className="text-gray-400 mt-1">Unduh dokumen panduan lengkap untuk Guru</p>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="bg-gray-700/50 p-6 rounded-xl border border-gray-600 hover:border-primary/50 transition duration-300">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="text-blue-400">📄</span> Panduan Guru (Google Drive)
            </h3>
            <p className="text-sm text-gray-400 mb-6 min-h-[60px]">
              Dokumen lengkap berisi cara penggunaan semua fitur di dashboard Guru, termasuk absensi siswa binaan, penginputan nilai kelas, catatan pelanggaran, dan prestasi.
            </p>
            <a 
              href="https://drive.google.com/drive/folders/1CZ5Ffqrs-h1eUC_PXKwSZFHeYU9lDcaz?usp=sharing" 
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-semibold shadow-lg transition-all transform hover:scale-[1.02]"
            >
              <span>🌐</span> Buka Panduan di Google Drive
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
