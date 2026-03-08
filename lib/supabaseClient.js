import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ijbqukmxrsvqviabeaie.supabase.co';
const supabaseAnonKey = 'sb_publishable_JUF2UMQaEKEf2BGisienMQ_FRwXVmIp';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
