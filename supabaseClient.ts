/// <reference types="vite/client" />
import { db } from './firebaseClient';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';

// Helper for fetching all documents from a Firestore collection
async function fetchAllCollection(colName: string): Promise<any[]> {
  try {
    const ref = collection(db, colName);
    const snap = await getDocs(ref);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    console.error(`Error fetching collection ${colName}:`, err);
    return [];
  }
}

// Relational fields resolver (analogous to SQL Joins)
async function resolveJoins(table: string, data: any[], selectFields: string) {
  if (!selectFields || selectFields === '*' || selectFields === 'id' || selectFields === 'id_siswa, id_guru') {
    return data;
  }
  
  const hasSiswa = selectFields.includes('siswa');
  const hasKelas = selectFields.includes('kelas');
  const hasMapel = selectFields.includes('mapel');
  const hasGuru = selectFields.includes('guru');
  
  let siswaData: any[] = [];
  let kelasData: any[] = [];
  let mapelData: any[] = [];
  let guruData: any[] = [];
  
  if (hasSiswa) siswaData = await fetchAllCollection('siswa');
  if (hasKelas) kelasData = await fetchAllCollection('kelas');
  if (hasMapel) mapelData = await fetchAllCollection('mapel');
  if (hasGuru) guruData = await fetchAllCollection('guru');
  
  const siswaMap = new Map(siswaData.map(s => [s.id, s]));
  const kelasMap = new Map(kelasData.map(k => [k.id, k]));
  const mapelMap = new Map(mapelData.map(m => [m.id, m]));
  const guruMap = new Map(guruData.map(g => [g.id, g]));
  
  const joinSiswa = (id_siswa: string) => {
    const s = siswaMap.get(id_siswa);
    if (!s) return null;
    const sClone = { ...s };
    if (hasKelas && sClone.id_kelas) {
      const k = kelasMap.get(sClone.id_kelas);
      sClone.kelas = k ? { id: k.id, nama: k.nama, kode: k.kode } : null;
    }
    return sClone;
  };
  
  return data.map(item => {
    const itemClone = { ...item };
    
    if (hasKelas && (itemClone.id_kelas || table === 'siswa')) {
      const kId = itemClone.id_kelas;
      if (kId) {
        const k = kelasMap.get(kId);
        itemClone.kelas = k ? { id: k.id, nama: k.nama, kode: k.kode } : null;
      }
    }
    
    if (hasSiswa && itemClone.id_siswa) {
      itemClone.siswa = joinSiswa(itemClone.id_siswa);
    }
    
    if (hasMapel && itemClone.id_mapel) {
      const mField = mapelMap.get(itemClone.id_mapel);
      itemClone.mapel = mField ? { id: mField.id, nama: mField.nama, kode: mField.kode } : null;
    }
    
    if (hasGuru && itemClone.id_guru) {
      const gField = guruMap.get(itemClone.id_guru);
      itemClone.guru = gField ? { id: gField.id, nama: gField.nama, nip: gField.nip, jenis_kelamin: gField.jenis_kelamin } : null;
    }
    
    return itemClone;
  });
}

// Utility to filter entity properties for saving (exclude associations and ids)
function cleanFields(obj: any): any {
  if (!obj) return {};
  const cleaned: any = {};
  for (const key of Object.keys(obj)) {
    if (
      key !== 'id' && 
      !key.startsWith('_') && 
      obj[key] !== undefined && 
      (obj[key] === null || typeof obj[key] !== 'object')
    ) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

// Supabase Realtime Channels Polyfill via Firestore onSnapshot
class SupabaseChannel {
  private listenerUnsubscribers: (() => void)[] = [];
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  on(type: string, filter: any, callback: (payload: any) => void) {
    const colName = filter.table;
    if (colName) {
      try {
        const ref = collection(db, colName);
        let isFirstEmit = true;
        const unsub = onSnapshot(ref, (snapshot) => {
          if (isFirstEmit) {
            isFirstEmit = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            let eventType: 'INSERT' | 'UPDATE' | 'DELETE' = 'UPDATE';
            if (change.type === 'added') eventType = 'INSERT';
            else if (change.type === 'modified') eventType = 'UPDATE';
            else if (change.type === 'removed') eventType = 'DELETE';

            callback({
              eventType,
              new: { id: change.doc.id, ...change.doc.data() },
              old: { id: change.doc.id }
            });
          });
        }, (error) => {
          console.error("onSnapshot listener error:", error);
        });
        this.listenerUnsubscribers.push(unsub);
      } catch (err) {
        console.error("onSnapshot configuration error:", err);
      }
    }
    return this;
  }

  subscribe() {
    return this;
  }

  unsubscribeAll() {
    this.listenerUnsubscribers.forEach(unsub => unsub());
    this.listenerUnsubscribers = [];
  }
}

// Supabase-compatible Query Builder on top of Firestore
class SupabaseQueryBuilder {
  private tableName: string;
  private localFilters: { field: string; op: string; value: any }[] = [];
  private orderByFields: { field: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private selectFields: string = '*';
  private _countOption: { count?: string; head?: boolean } | null = null;
  private _isSingle: boolean = false;
  private _isMaybeSingle: boolean = false;
  private updateData: any = null;
  private isDeleteOp: boolean = false;
  private insertData: any = null;
  private upsertData: any = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields?: string, options?: { count?: string; head?: boolean }) {
    if (fields) this.selectFields = fields;
    if (options) this._countOption = options;
    return this;
  }

  eq(field: string, value: any) {
    this.localFilters.push({ field, op: '==', value });
    return this;
  }

  neq(field: string, value: any) {
    this.localFilters.push({ field, op: '!=', value });
    return this;
  }

  gt(field: string, value: any) {
    this.localFilters.push({ field, op: '>', value });
    return this;
  }

  gte(field: string, value: any) {
    this.localFilters.push({ field, op: '>=', value });
    return this;
  }

  lt(field: string, value: any) {
    this.localFilters.push({ field, op: '<', value });
    return this;
  }

  lte(field: string, value: any) {
    this.localFilters.push({ field, op: '<=', value });
    return this;
  }

  in(field: string, value: any[]) {
    this.localFilters.push({ field, op: 'in', value });
    return this;
  }

  like(field: string, value: any) {
    this.localFilters.push({ field, op: 'like', value });
    return this;
  }

  ilike(field: string, value: any) {
    this.localFilters.push({ field, op: 'ilike', value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    const ascending = options?.ascending !== false;
    this.orderByFields.push({ field, ascending });
    return this;
  }

  limit(num: number) {
    this.limitCount = num;
    return this;
  }

  single() {
    this._isSingle = true;
    return this;
  }

  maybeSingle() {
    this._isMaybeSingle = true;
    return this;
  }

  insert(data: any) {
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.updateData = data;
    return this;
  }

  delete() {
    this.isDeleteOp = true;
    return this;
  }

  upsert(data: any) {
    this.upsertData = data;
    return this;
  }

  async getFilteredDocs(): Promise<any[]> {
    let docsList = await fetchAllCollection(this.tableName);
    
    for (const filter of this.localFilters) {
      const { field, op, value } = filter;
      docsList = docsList.filter(item => {
        const itemVal = item[field];
        if (op === '==') {
          return String(itemVal) === String(value);
        } else if (op === '!=') {
          return String(itemVal) !== String(value);
        } else if (op === '>') {
          return Number(itemVal) > Number(value);
        } else if (op === '>=') {
          return Number(itemVal) >= Number(value);
        } else if (op === '<') {
          return Number(itemVal) < Number(value);
        } else if (op === '<=') {
          return Number(itemVal) <= Number(value);
        } else if (op === 'in') {
          if (Array.isArray(value)) {
            return value.map(v => String(v)).includes(String(itemVal));
          }
          return false;
        } else if (op === 'like' || op === 'ilike') {
          if (typeof itemVal === 'string') {
            return itemVal.toLowerCase().includes(String(value).toLowerCase());
          }
          return false;
        }
        return true;
      });
    }

    if (this.orderByFields.length > 0) {
      docsList.sort((a, b) => {
        for (const order of this.orderByFields) {
          const field = order.field;
          const asc = order.ascending;
          const valA = a[field];
          const valB = b[field];
          
          if (valA === undefined || valA === null) return asc ? 1 : -1;
          if (valB === undefined || valB === null) return asc ? -1 : 1;
          
          if (typeof valA === 'string' && typeof valB === 'string') {
            const cmp = valA.localeCompare(valB);
            if (cmp !== 0) return asc ? cmp : -cmp;
          } else {
            const cmp = Number(valA) - Number(valB);
            if (cmp !== 0) return asc ? cmp : -cmp;
          }
        }
        return 0;
      });
    }

    if (this.limitCount !== null) {
      docsList = docsList.slice(0, this.limitCount);
    }
    
    return docsList;
  }

  async executeSelect() {
    let docs = await this.getFilteredDocs();
    const count = docs.length;

    if (this._countOption && this._countOption.head) {
      return { data: null, error: null, count };
    }

    docs = await resolveJoins(this.tableName, docs, this.selectFields);

    if (this._isSingle) {
      if (docs.length === 0) {
        throw new Error('No rows found');
      }
      return { data: docs[0], error: null, count };
    }

    if (this._isMaybeSingle) {
      return { data: docs.length > 0 ? docs[0] : null, error: null, count };
    }

    return { data: docs, error: null, count };
  }

  async executeInsert() {
    const rawRecords = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
    const results = [];
    for (const record of rawRecords) {
      const docId = record.id || doc(collection(db, this.tableName)).id;
      const cleaned = cleanFields(record);
      cleaned.createdAt = new Date().toISOString();
      await setDoc(doc(db, this.tableName, docId), cleaned);
      results.push({ id: docId, ...cleaned });
    }
    return { data: Array.isArray(this.insertData) ? results : results[0], error: null };
  }

  async executeUpdate() {
    const matchingDocs = await this.getFilteredDocs();
    const cleaned = cleanFields(this.updateData);
    
    for (const docObj of matchingDocs) {
      await updateDoc(doc(db, this.tableName, docObj.id), cleaned);
    }
    const results = matchingDocs.map(d => ({ ...d, ...cleaned }));
    return { data: results, error: null };
  }

  async executeDelete() {
    const matchingDocs = await this.getFilteredDocs();
    for (const docObj of matchingDocs) {
      await deleteDoc(doc(db, this.tableName, docObj.id));
    }
    return { data: matchingDocs, error: null };
  }

  async executeUpsert() {
    const rawRecords = Array.isArray(this.upsertData) ? this.upsertData : [this.upsertData];
    const results = [];
    for (const record of rawRecords) {
      let docId = record.id;
      
      if (!docId) {
        if (record.nisn && this.tableName === 'siswa') {
          docId = await this.findDocIdByField('nisn', record.nisn);
        } else if (record.kode && (this.tableName === 'kelas' || this.tableName === 'mapel')) {
          docId = await this.findDocIdByField('kode', record.kode);
        } else if (record.username && this.tableName === 'guru') {
          docId = await this.findDocIdByField('username', record.username);
        }
      }
      
      if (!docId) {
        docId = doc(collection(db, this.tableName)).id;
      }
      
      const cleaned = cleanFields(record);
      await setDoc(doc(db, this.tableName, docId), cleaned);
      results.push({ id: docId, ...cleaned });
    }
    return { data: Array.isArray(this.upsertData) ? results : results[0], error: null };
  }

  async findDocIdByField(fieldName: string, value: any): Promise<string | undefined> {
    try {
      const all = await fetchAllCollection(this.tableName);
      const found = all.find(item => String(item[fieldName]).trim() === String(value).trim());
      return found?.id;
    } catch (err) {
      return undefined;
    }
  }

  async then(onFulfilled?: (value: any) => any, onRejected?: (reason: any) => any) {
    try {
      let result: any = { data: [], error: null, count: 0 };

      if (this.insertData !== null) {
        result = await this.executeInsert();
      } else if (this.updateData !== null) {
        result = await this.executeUpdate();
      } else if (this.isDeleteOp) {
        result = await this.executeDelete();
      } else if (this.upsertData !== null) {
        result = await this.executeUpsert();
      } else {
        result = await this.executeSelect();
      }

      if (onFulfilled) {
        return Promise.resolve(onFulfilled(result));
      }
      return result;
    } catch (err: any) {
      console.error(`Query Execution Error in ${this.tableName}:`, err);
      const errPayload = { data: null, error: err, count: 0 };
      if (onRejected) {
        return Promise.resolve(onRejected(errPayload));
      }
      return errPayload;
    }
  }
}

// Global Supabase-Firestore bridge export
export const supabase = {
  channel: (name: string) => new SupabaseChannel(name),
  removeChannel: (channel: any) => {
    if (channel && typeof channel.unsubscribeAll === 'function') {
      channel.unsubscribeAll();
    }
  },
  from: (tableName: string) => new SupabaseQueryBuilder(tableName),
  auth: {
    signInWithPassword: () => Promise.resolve({ data: { user: null }, error: new Error('User management operates under offline mode') }),
    signOut: () => Promise.resolve({ error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  }
} as any;
