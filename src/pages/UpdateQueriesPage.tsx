import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components';
import { db } from '@/config/firebase';
import {
  collection as fsCollection,
  doc as fsDoc,
  getDocs,
  limit as fsLimit,
  query as fsQuery,
  where as fsWhere,
  orderBy as fsOrderBy,
  startAfter as fsStartAfter,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

type FieldInfo = { key: string; sample?: any };

type LookupMap = Record<string, string>;

interface SearchableDropdownProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const filteredOptions = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(value.toLowerCase())),
    [options, value]
  );

  return (
    <div
      className="relative w-full"
      tabIndex={-1}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full border p-2 rounded"
      />
      {open && filteredOptions.length > 0 && !disabled && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const collectionLabelMap: Record<string, string> = {
  customers: 'Customers',
  products: 'Products',
  orders_entries: 'Orders',
  purchases: 'Purchases',
  sales_entries: 'Sales',
  production_entries: 'Production',
  expenses: 'Expenses',
  raw_materials: 'Raw Materials',
  users: 'Users',
};

const fieldLabelMap: Record<string, string> = {
  customerId: 'Customer',
  productId: 'Product',
  rawMaterialId: 'Raw Material',
  orderDate: 'Order Date',
  deliveryDate: 'Delivery Date',
  totalPrice: 'Total Price',
  paidAmount: 'Paid Amount',
  remainingAmount: 'Remaining Amount',
  paymentStatus: 'Payment Status',
  pricePerCase: 'Price per Case',
  quantity: 'Quantity',
  date: 'Date',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
  remarks: 'Remarks',
  status: 'Status',
  supplier: 'Supplier',
  category: 'Category',
  name: 'Name',
};

const formatFieldLabel = (key: string) => {
  if (fieldLabelMap[key]) return fieldLabelMap[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const resolveDisplayValue = (key: string, row: any, lookups: { customers: LookupMap; products: LookupMap; rawMaterials: LookupMap }) => {
  const value = key.split('.').reduce((obj, part) => (obj ? obj[part] : undefined), row);
  if (key === 'customerId') return lookups.customers[value] || value || '';
  if (key === 'productId') return lookups.products[value] || value || '';
  if (key === 'rawMaterialId') return lookups.rawMaterials[value] || value || '';
  if (value instanceof Date) return value.toLocaleString();
  if (value && value.toDate) return value.toDate().toLocaleString();
  return value ?? '';
};

const normalizeCollectionName = (name: string) => {
  const mapping: Record<string, string> = {
    orders: 'orders_entries',
    sales: 'sales_entries',
    production: 'production_entries',
    rawMaterials: 'raw_materials',
    raw_material: 'raw_materials',
    raw_materials: 'raw_materials',
  };
  return mapping[name] ?? name;
};

export const AnalyticsPage: React.FC = () => {
  const [collections, setCollections] = useState<string[]>([]);
  const [collectionName, setCollectionName] = useState<string>('');
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const [fieldSearch, setFieldSearch] = useState('');

  const [filters, setFilters] = useState<any[]>([]);
  const [sorts, setSorts] = useState<any[]>([]);

  const [lookupCustomers, setLookupCustomers] = useState<LookupMap>({});
  const [lookupProducts, setLookupProducts] = useState<LookupMap>({});
  const [lookupRawMaterials, setLookupRawMaterials] = useState<LookupMap>({});

  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [includeDocId, setIncludeDocId] = useState(true);
  const [includeCreatedDate, setIncludeCreatedDate] = useState(false);
  const [includeUpdatedDate, setIncludeUpdatedDate] = useState(false);
  const [showRowNumbers, setShowRowNumbers] = useState(false);
  const [limit, setLimit] = useState<number | 'all'>(100);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Saved queries
  const [savedQueries, setSavedQueries] = useState<any[]>([]);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [customersSnap, productsSnap, materialsSnap] = await Promise.all([
          getDocs(fsCollection(db, 'customers')),
          getDocs(fsCollection(db, 'products')),
          getDocs(fsCollection(db, 'raw_materials')),
        ]);

        const customerMap: LookupMap = {};
        const productMap: LookupMap = {};
        const materialMap: LookupMap = {};

        customersSnap.docs.forEach(doc => {
          const data = doc.data();
          customerMap[doc.id] = data.name || data.customerName || doc.id;
        });
        productsSnap.docs.forEach(doc => {
          const data = doc.data();
          productMap[doc.id] = data.name || data.productName || doc.id;
        });
        materialsSnap.docs.forEach(doc => {
          const data = doc.data();
          materialMap[doc.id] = data.name || doc.id;
        });

        setLookupCustomers(customerMap);
        setLookupProducts(productMap);
        setLookupRawMaterials(materialMap);
      } catch (err) {
        console.warn('Failed to load lookup data for Analytics page', err);
      }
    };

    loadLookups();
    // Attempt to list collections by sampling root (Firestore JS SDK doesn't list collections client-side reliably)
    // We'll query a well-known admin collection 'meta_collections' if present, else fall back to a static list.
    const tryLoad = async () => {
      try {
        // try sampling a document to infer collection names (heuristic)
        // Fallback: read saved queries collection to get collection names used
        const sqSnap = await getDocs(fsCollection(db, 'update_queries_meta'));
        const names = new Set<string>();
        sqSnap.docs.forEach(d => { names.add(d.data()?.collection || ''); });
        const arr = Array.from(names).filter(Boolean).map(normalizeCollectionName);
        setCollections(arr.length ? arr : ['customers','products','orders_entries','purchases','sales_entries','production_entries','expenses','raw_materials','users']);
      } catch (err) {
        setCollections(['customers','products','orders_entries','purchases','sales_entries','production_entries','expenses','raw_materials','users']);
      }
    };
    tryLoad();
  }, []);

  useEffect(() => {
    const loadFields = async () => {
      setFields([]);
      setSelectedFields({});
      setFieldSearch('');
      setFilters([]);
      setSorts([]);
      setRows([]);
      setTotalCount(null);
      if (!collectionName) return;
      setLoading(true);
      setError(null);
      try {
        const normalizedCollection = normalizeCollectionName(collectionName);
        const snap = await getDocs(fsQuery(fsCollection(db, normalizedCollection), fsLimit(10)));
        if (snap.docs.length === 0) {
          setFields([]);
        } else {
          const keys = new Set<string>();
          const walk = (obj: any, prefix = '') => {
            if (!obj || typeof obj !== 'object') return;
            Object.keys(obj).forEach(k => {
              const val = obj[k];
              const key = prefix ? `${prefix}.${k}` : k;
              keys.add(key);
              if (val && typeof val === 'object' && !Array.isArray(val) && !(val?.toDate)) {
                walk(val, key);
              }
            });
          };
          const samples: Record<string, any> = {};
          snap.docs.forEach(doc => {
            const data = doc.data();
            walk(data);
            Object.keys(data).forEach(key => {
              if (samples[key] === undefined) samples[key] = data[key];
            });
          });
          const list = Array.from(keys).sort();
          const fi = list.map(k => ({ key: k, sample: samples[k.split('.')[0]] }));
          setFields(fi);
          const sel: Record<string, boolean> = {};
          fi.forEach(f => { sel[f.key] = true; });
          setSelectedFields(sel);
        }
      } catch (err: any) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };
    loadFields();
  }, [collectionName]);

  const visibleFields = useMemo(() => fields.filter(f => f.key.toLowerCase().includes(fieldSearch.toLowerCase())), [fields, fieldSearch]);

  const distinctFieldValues = useMemo(() => {
    const valuesByField: Record<string, string[]> = {};
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        const raw = row[key];
        if (raw === undefined || raw === null) return;
        const value = typeof raw === 'string' ? raw : JSON.stringify(raw);
        if (!valuesByField[key]) valuesByField[key] = [];
        if (!valuesByField[key].includes(value)) valuesByField[key].push(value);
      });
    });
    Object.keys(valuesByField).forEach((key) => {
      valuesByField[key].sort((a, b) => a.localeCompare(b));
    });
    return valuesByField;
  }, [rows]);

  const toggleField = (key: string) => {
    setSelectedFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const addFilter = () => setFilters(prev => [...prev, { field: fields[0]?.key || '', op: '=', value: '', conj: 'AND' }]);
  const clearFilters = () => setFilters([]);

  const addSort = () => setSorts(prev => [...prev, { field: fields[0]?.key || '', dir: 'desc' }]);
  const clearSorts = () => setSorts([]);

  const runQuery = async () => {
    if (!collectionName) { setError('No collection selected'); return; }
    const selKeys = Object.keys(selectedFields).filter(k => selectedFields[k]);
    if (selKeys.length === 0) { setError('No fields selected'); return; }
    setLoading(true); setError(null);
    try {
      const colRef = fsCollection(db, collectionName);
      const whereClauses: any[] = [];
      const orderClauses: any[] = [];

      const parseValue = (fieldName: string, raw: any) => {
        if (raw === null || raw === undefined) return raw;
        const s = String(raw).trim();
        // preserve quoted strings
        if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) return s.slice(1, -1);
        // comma separated for `in`
        if (s.includes(',') && raw && Array.isArray(raw) === false) return s.split(',').map(x=>x.trim());
        // numeric
        if (!isNaN(Number(s))) return Number(s);
        return s;
      };

      let docs: any[] = [];
      try {
        for (const f of filters) {
          if (!f.field) continue;
          if (f.op === 'in') {
            const val = parseValue(f.field, f.value);
            if (!Array.isArray(val)) throw new Error('`in` operator requires comma-separated list');
            whereClauses.push(fsWhere(f.field, 'in', val));
          } else if (['=','!=','<','<=','>','>='].includes(f.op)) {
            whereClauses.push(fsWhere(f.field, f.op, parseValue(f.field, f.value)));
          } else {
            // complex operators will be applied client-side later
          }
        }

        for (const s of sorts) {
          if (s.field) orderClauses.push(fsOrderBy(s.field, s.dir === 'desc' ? 'desc' : 'asc'));
        }

        const limitClause = limit !== 'all' ? fsLimit(typeof limit === 'number' ? limit : 100) : null;
        const q = fsQuery(colRef, ...(whereClauses.concat(orderClauses)).concat(limitClause ? [limitClause] : []));
        const snap = await getDocs(q);
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (fireErr) {
        // Firestore query failed (index or operator restrictions) — fallback to client-side scan
        console.warn('Firestore query failed, falling back to client-side scan:', fireErr);
        const scanLimit = typeof limit === 'number' ? Math.max(200, limit) : 500;
        const snap = await getDocs(fsQuery(colRef, fsLimit(scanLimit)));
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setError('Firestore query could not be executed server-side; applied a limited client-side scan. Error: ' + String(fireErr));
      }
      

      // client-side apply filters not converted
      const applyClientFilter = (row: any) => {
        for (const f of filters) {
          const val = (row && f.field) ? f.field.split('.').reduce((a: any, k: string) => (a ? a[k] : undefined), row) : undefined;
          const rv = f.value;
          switch (f.op) {
            case 'contains': if (!String(val || '').includes(String(rv))) return false; break;
            case 'startsWith': if (!String(val || '').startsWith(String(rv))) return false; break;
            case 'endsWith': if (!String(val || '').endsWith(String(rv))) return false; break;
            case '=': if (String(val) !== String(rv)) return false; break;
            case '!=': if (String(val) === String(rv)) return false; break;
            case '<': if (!(Number(val) < Number(rv))) return false; break;
            case '<=': if (!(Number(val) <= Number(rv))) return false; break;
            case '>': if (!(Number(val) > Number(rv))) return false; break;
            case '>=': if (!(Number(val) >= Number(rv))) return false; break;
            default: break;
          }
        }
        return true;
      };

      docs = docs.filter(applyClientFilter);

      // remove duplicates if requested
      if (removeDuplicates) {
        const seen = new Set();
        docs = docs.filter(d => {
          const sig = JSON.stringify(selKeys.map((k:any) => k.split('.').reduce((a:any,p:string)=> a ? a[p] : undefined, d)));
          if (seen.has(sig)) return false; seen.add(sig); return true;
        });
      }

      const normalizeSortValue = (value: any) => {
        if (value && typeof value.toDate === 'function') return value.toDate().getTime();
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'string' && !isNaN(Date.parse(value))) return Date.parse(value);
        if (typeof value === 'string' && !isNaN(Number(value))) return Number(value);
        return value ?? '';
      };

      if (sorts.length > 0) {
        docs.sort((a, b) => {
          for (const s of sorts) {
            if (!s.field) continue;
            const aValue = normalizeSortValue(s.field.split('.').reduce((x:any, part:string) => (x ? x[part] : undefined), a));
            const bValue = normalizeSortValue(s.field.split('.').reduce((x:any, part:string) => (x ? x[part] : undefined), b));

            if (aValue === bValue) continue;
            const direction = s.dir === 'desc' ? -1 : 1;

            if (aValue === undefined || aValue === null || aValue === '') return 1 * direction;
            if (bValue === undefined || bValue === null || bValue === '') return -1 * direction;
            if (aValue < bValue) return -1 * direction;
            if (aValue > bValue) return 1 * direction;
          }
          return 0;
        });
      }

      setRows(docs.map(r => {
        const out: any = {};
        if (includeDocId) out._id = r.id;
        selectedFields && Object.keys(selectedFields).filter(k => selectedFields[k]).forEach(k => {
          out[k] = resolveDisplayValue(k, r, {
            customers: lookupCustomers,
            products: lookupProducts,
            rawMaterials: lookupRawMaterials,
          });
        });
        return out;
      }));
      setTotalCount(docs.length);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const saveQuery = async (name: string) => {
    if (!name) return; 
    const payload = { name, collection: collectionName, selectedFields, filters, sorts, options: { removeDuplicates, includeDocId, includeCreatedDate, includeUpdatedDate, showRowNumbers, limit } };
    await addDoc(fsCollection(db, 'update_queries_meta'), payload);
  };

  return (
    <Layout title="Analytics" subtitle="Firebase Data Extractor & Report Generator">
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Analytics — Firebase Data Extractor & Report Generator</h2>

        <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3">
          <div className="card p-4 rounded shadow-sm">
            <label className="block mb-2">Collection Name</label>
            <select value={collectionName} onChange={e => setCollectionName(e.target.value)} className="w-full border p-2 rounded">
              <option value="">-- select --</option>
              {collections.map(c => (
                <option key={c} value={c}>{collectionLabelMap[c] ?? c}</option>
              ))}
            </select>

            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <input className="border p-1" placeholder="Search fields" value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} />
                <button onClick={() => { const all: Record<string, boolean> = {}; fields.forEach(f => all[f.key]=true); setSelectedFields(all); }} className="px-2 py-1 border rounded">Select All</button>
                <button onClick={() => setSelectedFields({})} className="px-2 py-1 border rounded">Clear All</button>
              </div>
              <div className="max-h-64 overflow-auto border rounded p-2">
                {visibleFields.map(f => (
                  <label key={f.key} className="block text-sm">
                    <input type="checkbox" checked={!!selectedFields[f.key]} onChange={() => toggleField(f.key)} /> {f.key}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <div className="card p-4 rounded shadow-sm mb-4">
            <h3 className="font-semibold mb-2">Filters</h3>
            {filters.map((f, idx) => {
              const values = distinctFieldValues[f.field] || [];
              return (
                <div key={idx} className="flex gap-2 mb-2">
                  <select
                    value={f.field}
                    onChange={e => {
                      const v = e.target.value;
                      setFilters(prev => prev.map((p,i)=> i===idx?{...p,field:v,value:''}:p));
                    }}
                    className="border p-1"
                  >
                    <option value="" disabled>Select field</option>
                    {fields.map(ff=> <option key={ff.key} value={ff.key}>{ff.key}</option>)}
                  </select>
                  <select value={f.op} onChange={e => setFilters(prev => prev.map((p,i)=> i===idx?{...p,op:e.target.value}:p))} className="border p-1">
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value="contains">contains</option>
                    <option value="startsWith">startsWith</option>
                    <option value="endsWith">endsWith</option>
                    <option value="in">in</option>
                  </select>
                  <div className="flex-1">
                    <SearchableDropdown
                      label="Value"
                      value={f.value}
                      onChange={val => setFilters(prev => prev.map((p,i)=> i===idx?{...p,value:val}:p))}
                      options={values}
                      placeholder={f.field ? 'Type or choose a value' : 'Select a field first'}
                      disabled={!f.field}
                    />
                  </div>
                  {idx > 0 && (
                    <select value={f.conj} onChange={e => setFilters(prev => prev.map((p,i)=> i===idx?{...p,conj:e.target.value}:p))} className="border p-1">
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </select>
                  )}
                  <button onClick={() => setFilters(prev => prev.filter((_,i)=>i!==idx))} className="px-2 py-1 border rounded">Delete</button>
                </div>
              );
            })}
            <div className="flex gap-2">
              <button onClick={addFilter} className="px-3 py-2 bg-primary text-white rounded">Add Filter</button>
              <button onClick={clearFilters} className="px-3 py-2 border rounded">Clear Filters</button>
            </div>
          </div>

          <div className="card p-4 rounded shadow-sm mb-4">
            <h3 className="font-semibold mb-2">Sorting</h3>
            {sorts.map((s, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <select value={s.field} onChange={e => setSorts(prev => prev.map((p,i)=> i===idx?{...p,field:e.target.value}:p))} className="border p-1">
                  <option value="" disabled>Select field</option>
                  {fields.map(ff=> <option key={ff.key} value={ff.key}>{ff.key}</option>)}
                </select>
                <select value={s.dir} onChange={e => setSorts(prev => prev.map((p,i)=> i===idx?{...p,dir:e.target.value}:p))} className="border p-1">
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
                <button onClick={() => setSorts(prev => prev.filter((_,i)=>i!==idx))} className="px-2 py-1 border rounded">Delete</button>
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={addSort} className="px-3 py-2 bg-primary text-white rounded">Add Sort</button>
              <button onClick={clearSorts} className="px-3 py-2 border rounded">Clear Sort</button>
            </div>
          </div>

          <div className="card p-4 rounded shadow-sm">
            <h3 className="font-semibold mb-2">Output Options</h3>
            <label className="block"><input type="checkbox" checked={removeDuplicates} onChange={e=>setRemoveDuplicates(e.target.checked)} /> Remove duplicate records</label>
            <label className="block"><input type="checkbox" checked={includeDocId} onChange={e=>setIncludeDocId(e.target.checked)} /> Include Document ID</label>
            <label className="block"><input type="checkbox" checked={includeCreatedDate} onChange={e=>setIncludeCreatedDate(e.target.checked)} /> Include Created Date</label>
            <label className="block"><input type="checkbox" checked={includeUpdatedDate} onChange={e=>setIncludeUpdatedDate(e.target.checked)} /> Include Updated Date</label>
            <label className="block"><input type="checkbox" checked={showRowNumbers} onChange={e=>setShowRowNumbers(e.target.checked)} /> Show Row Numbers</label>
            <div className="mt-2">Records Per Page: <select value={String(limit)} onChange={e => setLimit(e.target.value==='all'?'all':Number(e.target.value))} className="border p-1 ml-2">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
              <option value="all">All</option>
            </select></div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <div className="card p-4 rounded shadow-sm">
            <h3 className="font-semibold mb-2">Actions</h3>
            <div className="flex flex-col gap-2">
              <button onClick={runQuery} className="px-3 py-2 bg-primary text-white rounded">Preview Data</button>
              <button onClick={() => {/* export excel */}} className="px-3 py-2 border rounded">Export Excel</button>
              <button onClick={() => {/* export csv */}} className="px-3 py-2 border rounded">Export CSV</button>
              <button onClick={() => window.print()} className="px-3 py-2 border rounded">Print Report</button>
              <button onClick={() => { setCollectionName(''); setFields([]); setSelectedFields({}); setFilters([]); setSorts([]); setRows([]); }} className="px-3 py-2 border rounded">Clear All</button>
              <button onClick={() => saveQuery(prompt('Query name') || '')} className="px-3 py-2 border rounded">Save Query</button>
              <button onClick={async () => { const sq = await getDocs(fsCollection(db, 'update_queries_meta')); setSavedQueries(sq.docs.map(d=>({ id:d.id, ...d.data()}))); }} className="px-3 py-2 border rounded">Load Saved Query</button>
            </div>
            {loading && <div className="mt-4">Loading...</div>}
            {error && <div className="mt-4 text-red-600">{error}</div>}
          </div>
        </div>

        <div className="col-span-12">
          <div className="card p-4 rounded shadow-sm">
            <h3 className="font-semibold mb-2">Results ({totalCount ?? 0})</h3>
            <div className="overflow-auto">
              <table className="min-w-full border">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    {showRowNumbers && <th className="p-2 border">#</th>}
                    {includeDocId && <th className="p-2 border">_id</th>}
                    {Object.keys(selectedFields).filter(k=>selectedFields[k]).map(col => (
                      <th key={col} className="p-2 border">{formatFieldLabel(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {showRowNumbers && <td className="p-2 border">{idx+1}</td>}
                      {includeDocId && <td className="p-2 border">{r._id}</td>}
                      {Object.keys(selectedFields).filter(k=>selectedFields[k]).map(col => (
                        <td key={col} className="p-2 border">{String(r[col] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Layout>
  );
};

export default AnalyticsPage;
