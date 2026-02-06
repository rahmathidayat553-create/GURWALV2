import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://plovtqealsfydvoonvqn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsb3Z0cWVhbHNmeWR2b29udnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzQ5MzMsImV4cCI6MjA4NDIxMDkzM30.-wL6cpOYwBnKdQMTxhNgzFnKwKdXlRx4fjlwan9pVHE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: { 'Accept': 'application/json' }
  }
});