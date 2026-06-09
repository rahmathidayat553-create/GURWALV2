import React, { useState, useEffect } from 'react';
import { initAuth, googleSignIn, getAccessToken, googleLogout } from '../googleAuth';
import { User } from 'firebase/auth';

export const GoogleCalendar: React.FC = () => {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setUser(user);
        setNeedsAuth(false);
        fetchEvents();
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => {
      // Because onAuthStateChanged returns an unsubscribe function
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        fetchEvents();
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await googleLogout();
    setEvents([]);
    setNeedsAuth(true);
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      
      const timeMin = new Date().toISOString();
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=5&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          setNeedsAuth(true);
        }
        throw new Error('Failed to fetch events');
      }
      
      const data = await response.json();
      setEvents(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow border-l-4 border-indigo-500">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
          <span>📅</span> Agenda Google Calendar
        </h3>
        {!needsAuth && user && (
           <button onClick={handleLogout} className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded transition border border-red-500/30">
            Disconnect
           </button>
        )}
      </div>

      {needsAuth ? (
        <div className="text-center py-6 bg-gray-900/50 rounded-lg border border-gray-700">
          <p className="text-gray-400 mb-4 text-sm">Hubungkan ke Google Calendar untuk melihat jadwal agenda Anda secara langsung.</p>
          <button 
            onClick={handleLogin} 
            disabled={isLoggingIn}
            className="bg-white text-gray-800 px-5 py-2.5 rounded-lg font-medium shadow flex items-center gap-3 mx-auto hover:bg-gray-100 transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
            {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
          </button>
        </div>
      ) : (
        <div>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-6 bg-gray-900/50 rounded-lg border border-gray-700">
               <p className="text-gray-400">Tidak ada agenda mendatang ditemukan.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date);
                // format locale string with timezone ID if needed, or stick to simple
                const timeString = start.toLocaleString('id-ID', { 
                  weekday: 'short', 
                  day: 'numeric', 
                  month: 'short', 
                  hour: '2-digit', 
                  minute: '2-digit' 
                });
                
                return (
                  <div key={event.id} className="bg-gray-900 p-4 rounded-lg border border-gray-700 flex justify-between items-center hover:border-gray-600 transition">
                    <div>
                      <h4 className="text-white font-medium">{event.summary || '(Tanpa Judul)'}</h4>
                      <p className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                        <span>🕒</span> {timeString}
                      </p>
                    </div>
                    {event.htmlLink && (
                      <a href={event.htmlLink} target="_blank" rel="noreferrer" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition shadow-sm">
                        Detail
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
