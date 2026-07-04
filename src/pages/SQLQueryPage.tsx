import React, { useState } from 'react';
import { db } from '@/config/firebase';
import { collection, getDocs, query as fsQuery, where as fsWhere, orderBy as fsOrderBy, limit as fsLimit } from 'firebase/firestore';

const parseSQL = (sql: string) => {
  const normalized = sql.trim().replace(/\s+/g, ' ');
  const re = /select\s+(.+?)\s+from\s+(\w+)(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+(\w+)(?:\s+(asc|desc))?)?(?:\s+limit\s+(\d+))?/i;
  const m = normalized.match(re);
  if (!m) return { error: 'Could not parse SQL. Try: SELECT * FROM collection WHERE field = value ORDER BY field DESC LIMIT 10' };
  const [, fields, collectionName, whereClause, orderField, orderDir, limitCount] = m;
  return { fields: fields.split(',').map(s => s.trim()), collectionName, whereClause, orderField, orderDir: orderDir?.toUpperCase(), limitCount: limitCount ? parseInt(limitCount, 10) : undefined };
};

const parseWhere = (whereClause?: string) => {
  if (!whereClause) return null;
  // support multiple AND-separated conditions for now
  const parts = whereClause.split(/\s+and\s+/i).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const conditions: Array<{ field: string; op: string; value: any } | { error: string }> = [];
  for (const part of parts) {
    // support simple comparisons: =, !=, <, <=, >, >=
    const m = part.match(/([\w.]+)\s*(=|!=|<=|<|>=|>)\s*(.+)/);
    if (!m) {
      // allow single-token shorthand: treat as id = token
      const tokenMatch = part.match(/^(['"]?)([\w-:@.]+)\1$/);
      if (tokenMatch) {
        const token = tokenMatch[2];
        conditions.push({ field: 'id', op: '==', value: token });
        continue;
      }
      conditions.push({ error: `Could not parse WHERE condition: ${part}` });
      continue;
    }
    let [, field, op, rawVal] = m as string[];
    let val: any = rawVal.trim();
    // detect surrounding quotes and preserve string if quoted
    let isQuoted = false;
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      isQuoted = true;
      val = val.slice(1, -1);
    }
    if (!isQuoted && !isNaN(Number(val))) {
      val = Number(val);
    }
    const opMap: Record<string, any> = { '=': '==', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
    conditions.push({ field, op: opMap[op], value: val });
  }
  return conditions;
};

export const SQLQueryPage: React.FC = () => {
  const [sql, setSql] = useState<string>('SELECT * FROM customers LIMIT 10');
  const [collectionInput, setCollectionInput] = useState<string>('customers');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [debug, setDebug] = useState<any>(null);

  const run = async () => {
    setError(null);
    setRows([]);
    setColumns([]);
    const parsed = parseSQL(sql);
    if ((parsed as any).error) {
      setError((parsed as any).error);
      return;
    }

    let { fields, collectionName, whereClause, orderField, orderDir, limitCount } = parsed as any;
    if (collectionInput && collectionInput.trim()) {
      collectionName = collectionInput.trim();
    }

    const where = parseWhere(whereClause);
    if (where) {
      const firstErr = (where as any[]).find((c: any) => c && c.error);
      if (firstErr) {
        setError(firstErr.error);
        return;
      }
    }

    setLoading(true);
    try {
      const colRef = collection(db, collectionName);
      const parts: any[] = [];
      if (where) {
        for (const cond of where as any[]) {
          parts.push(fsWhere(cond.field, cond.op, cond.value));
        }
      }
      if (orderField) {
        parts.push(fsOrderBy(orderField, orderDir === 'DESC' ? 'desc' : 'asc'));
      }
      if (limitCount) {
        parts.push(fsLimit(limitCount));
      }
      const q = parts.length ? fsQuery(colRef, ...parts) : fsQuery(colRef);
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDebug({ collectionName, conditions: where || [], orderField, orderDir, limitCount, docsFound: docs.length, sample: docs[0] ?? null });
      setRows(docs as any[]);

      // If no results, try a limited client-side scan fallback (helpful for phone stored differently)
      if ((docs.length === 0 || docs.length === undefined) && where && Array.isArray(where) && (where as any[]).length > 0) {
        try {
          const firstCond = (where as any[])[0];
          const token = String(firstCond.value ?? '').trim();
          if (token) {
            const scanLimit = 200; // conservative
            const scanSnap = await getDocs(fsQuery(colRef, fsLimit(scanLimit)));
            const scanDocs = scanSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const normalizeDigits = (s: string) => (s || '').toString().replace(/\D/g, '');
            const normToken = normalizeDigits(token);
            const matches: any[] = [];
            const valueMatches = (v: any) => {
              if (v === null || v === undefined) return false;
              if (typeof v === 'object') {
                // check nested
                return Object.values(v).some(valueMatches);
              }
              const s = String(v);
              if (normToken && normalizeDigits(s) === normToken) return true;
              if (s === token) return true;
              return false;
            };
            for (const d of scanDocs) {
              if (valueMatches(d)) matches.push(d);
            }
            if (matches.length > 0) {
              setDebug((prev: any) => ({ ...prev, fallbackScan: true, fallbackMatches: matches.length }));
              setRows(matches.slice(0, 100));
              const cols = new Set<string>();
              matches.slice(0, 100).forEach((r: any) => Object.keys(r || {}).forEach(k => cols.add(k)));
              setColumns(Array.from(cols));
            } else {
              setDebug((prev: any) => ({ ...prev, fallbackScan: true, fallbackMatches: 0 }));
            }
          }
        } catch (scanErr) {
          setDebug((prev: any) => ({ ...prev, fallbackError: String(scanErr) }));
        }
      }
      // determine columns
      const cols = new Set<string>();
      docs.forEach((r: any) => Object.keys(r || {}).forEach(k => cols.add(k)));
      // if fields is not '*' then limit to selected (support nested field names)
      const finalCols = fields.length === 1 && fields[0] === '*' ? Array.from(cols) : fields.filter(f => f !== '*');
      setColumns(finalCols);
    } catch (err: any) {
      setDebug({ collectionName, conditions: where || [], orderField, orderDir, limitCount, error: err?.message || String(err) });
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const getNested = (obj: any, path: string) => {
    if (!obj) return undefined;
    return path.split('.').reduce((acc: any, key) => (acc ? acc[key] : undefined), obj);
  };

  const formatDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${dd}-${mon}-${yyyy}`;
  };

  const formatValue = (v: any) => {
    if (v === null || v === undefined) return '';
    // Firestore Timestamp (has toDate)
    if (typeof v === 'object' && typeof v.toDate === 'function') {
      try { return formatDate(v.toDate()); } catch { /* fallthrough */ }
    }
    // Date instance
    if (v instanceof Date) return formatDate(v);
    // ISO string
    if (typeof v === 'string') {
      const iso = Date.parse(v);
      if (!isNaN(iso)) return formatDate(new Date(iso));
    }
    // numeric epoch (seconds or ms)
    if (typeof v === 'number') {
      // heuristics: if seconds (10 digits) convert to ms
      const asMs = v < 1e12 ? v * 1000 : v;
      const date = new Date(asMs);
      if (!isNaN(date.getTime())) return formatDate(date);
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const exportCSV = () => {
    if (!rows.length || !columns.length) return;
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const header = columns.join(',');
    const lines = rows.map(r => columns.map(col => escape(getNested(r, col))).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query-results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">SQL-style Firestore Queries</h2>

      <p className="text-sm text-gray-600 mb-2">Write simple SQL-like queries to fetch documents from Firestore collections.</p>

      <div className="flex gap-2 mb-2">
        <label className="text-sm flex items-center gap-2">
          Collection:
          <input value={collectionInput} onChange={(e) => {
            const newCol = e.target.value;
            setCollectionInput(newCol);
            // if SQL contains FROM <something> replace it
            setSql(prev => prev.replace(/from\s+\w+/i, `from ${newCol}`));
          }} className="border px-2 py-1 rounded" />
        </label>
      </div>

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={4}
        className="w-full p-3 border rounded mb-2"
      />

      <div className="flex gap-2 mb-4">
        <button onClick={run} disabled={loading} className="px-4 py-2 bg-primary text-white rounded">
          {loading ? 'Running...' : 'Run'}
        </button>
        <button onClick={exportCSV} disabled={rows.length === 0 || columns.length === 0} className="px-4 py-2 border rounded">
          Export CSV
        </button>
        <button onClick={() => { setSql(`SELECT * FROM ${collectionInput} LIMIT 10`); setError(null); setRows([]); setColumns([]); }} className="px-4 py-2 border rounded">
          Reset
        </button>
      </div>

      {error && <div className="mb-4 text-red-600">{error}</div>}

      <div className="overflow-auto">
        <table className="min-w-full bg-white rounded overflow-hidden">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} className="px-3 py-2 text-left border-b">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id || idx} className="hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col} className="px-3 py-2 align-top border-b">{formatValue(getNested(r, col))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SQLQueryPage;
