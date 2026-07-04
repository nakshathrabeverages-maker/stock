import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card } from '@/components';

const COLLECTIONS = [
  'sales_entries',
  'raw_materials',
  'products',
  'customers',
  'expenses',
  'orders',
  'purchases',
  'production',
  'material_usage',
  'users',
];

export const QueriesPage: React.FC = () => {
  const [collectionName, setCollectionName] = useState(COLLECTIONS[0]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleHeaders = useMemo(() => {
    if (!documents.length) return [];
    const keys = new Set<string>();
    documents.forEach((doc) => Object.keys(doc || {}).forEach((key) => keys.add(key)));
    return Array.from(keys).slice(0, 10);
  }, [documents]);

  useEffect(() => {
    const fetchCollection = async () => {
      setLoading(true);
      setError(null);
      try {
        const collectionRef = collection(db, collectionName);
        const q = query(collectionRef, orderBy('id', 'asc'));
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setDocuments(rows);
      } catch (err) {
        setError('Unable to load documents. Check the collection name and Firestore security rules.');
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCollection();
  }, [collectionName]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Queries</h1>
      <Card className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">Select a collection to view</p>
            <select
              className="border rounded p-2 bg-white text-base"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
            >
              {COLLECTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-600">
            {loading ? 'Loading documents…' : `${documents.length} documents loaded`}
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-6 rounded border border-red-300 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 font-semibold">Document ID</th>
              {visibleHeaders.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 align-top text-sm text-slate-700">{doc.id}</td>
                {visibleHeaders.map((header) => (
                  <td key={`${doc.id}-${header}`} className="px-4 py-3 align-top text-sm text-slate-700 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">
                    {doc[header] === undefined ? '-' : String(doc[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
