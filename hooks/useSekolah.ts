import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Sekolah } from "../types";

export function useSekolah() {
  const [sekolah, setSekolah] = useState<Partial<Sekolah>>({});

  useEffect(() => {
    // 1. Initial Fetch
    async function fetchSekolah() {
      const { data, error } = await supabase
        .from("sekolah")
        .select("nama, logo_url")
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setSekolah(data);
      }
    }
    fetchSekolah();

    // 2. Realtime Subscription (Optional: updates logo/name instantly if changed in settings)
    const channel = supabase
      .channel('sekolah_global_update')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sekolah' }, (payload) => {
          setSekolah(payload.new as Sekolah);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return sekolah;
}