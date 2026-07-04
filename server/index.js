const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const admin = require('firebase-admin');
const { getFallbackReply } = require('./queryHelpers');

const PORT = process.env.PORT || 8787;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-pro';
const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://gemini.googleapis.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-grok-mini';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN;
const GITHUB_MODEL = process.env.GITHUB_MODEL || process.env.COPILOT_MODEL || 'openai/gpt-4.1-mini';
const GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://models.inference.ai.azure.com';

function isApiKeyLike(key) {
  return typeof key === 'string' && /^AIza[0-9A-Za-z_-]{35}$/.test(key);
}

function isBearerTokenLike(key) {
  return typeof key === 'string' && /^(ya29\.|AQ\.)/.test(key);
}

let firebaseInitialized = false;
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseInitialized = true;
    console.log('Initialized Firebase Admin from env JSON');
  } catch (err) {
    console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err.message);
  }
} else if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseInitialized = true;
    console.log('Initialized Firebase Admin from server/serviceAccountKey.json');
  } catch (err) {
    console.warn('Failed to initialize Firebase from serviceAccountKey.json:', err.message);
  }
} else {
  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    firebaseInitialized = true;
    console.log('Initialized Firebase Admin with application default credentials');
  } catch (err) {
    console.warn('Firebase Admin not initialized. Firestore access will be disabled until credentials are configured.', err.message);
  }
}

const db = firebaseInitialized ? admin.firestore() : null;

const app = express();
app.use(cors());
app.use(express.json());

function buildDocText(collectionName, docId, data) {
  const parts = [`${collectionName} ${docId}`];
  Object.entries(data || {}).forEach(([key, value]) => {
    if (key === 'id' || value === undefined || value === null) return;
    if (value?.toDate) {
      parts.push(`${key}=${value.toDate().toISOString()}`);
    } else if (value instanceof Date) {
      parts.push(`${key}=${value.toISOString()}`);
    } else if (typeof value === 'object') {
      parts.push(`${key}=${JSON.stringify(value)}`);
    } else {
      parts.push(`${key}=${String(value)}`);
    }
  });
  return parts.join(' | ');
}

async function getDocumentsForIndexing() {
  if (!db) {
    return [];
  }

  const collections = ['sales_entries', 'raw_materials', 'products', 'customers'];
  const docsToIndex = [];

  for (const collectionName of collections) {
    try {
      const snap = await db.collection(collectionName).get();
      snap.forEach((doc) => {
        const text = buildDocText(collectionName, doc.id, doc.data());
        if (!text.trim()) return;
        docsToIndex.push({
          id: `${collectionName}/${doc.id}`,
          text,
          metadata: { type: collectionName, id: doc.id, collection: collectionName, text },
        });
      });
    } catch (err) {
      console.warn(`Unable to read collection ${collectionName}:`, err.message);
    }
  }

  return docsToIndex;
}

function tokenize(text) {
  return (text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

function scoreDocument(doc, queryTokens) {
  const docTokens = new Set(tokenize(doc.text));
  let score = 0;
  queryTokens.forEach((token) => {
    if (docTokens.has(token)) score += 2;
  });
  return score;
}

async function retrieveLocalMatches(query, topK = 5) {
  const docs = await getDocumentsForIndexing();
  if (!docs.length) return [];

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  return docs
    .map((doc) => ({ ...doc, score: scoreDocument(doc, queryTokens) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ score, ...doc }) => ({ ...doc, score }));
}


async function callGeminiModel(query, contextText) {
  const baseUrl = (GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1').replace(/\/+$/, '');
  const modelPath = GEMINI_MODEL && GEMINI_MODEL.startsWith('models/') ? GEMINI_MODEL : `models/${GEMINI_MODEL}`;
  const generateUrl = `${baseUrl}/${modelPath}:generate`;
  const generateContentUrl = `${baseUrl}/${modelPath}:generateContent`;

  const requestBody = {
    prompt: {
      messages: [
        {
          author: 'system',
          content: [
            {
              type: 'text',
              text: 'You are a business analyst assistant. Answer the user question naturally and precisely using the provided Firestore context. If the context does not contain enough information, say so clearly.',
            },
          ],
        },
        {
          author: 'user',
          content: [
            {
              type: 'text',
              text: `Context:\n${contextText}\n\nQuestion:\n${query}`,
            },
          ],
        },
      ],
    },
    temperature: 0.2,
    maxOutputTokens: 700,
  };

  function extractGeminiText(data) {
    if (!data) return null;
    if (typeof data.output_text === 'string') return data.output_text;

    if (Array.isArray(data.candidates) && data.candidates[0]) {
      const candidate = data.candidates[0];
      if (typeof candidate.text === 'string') return candidate.text;
      if (Array.isArray(candidate.content)) return candidate.content.map((item) => item?.text || item || '').join('');
      if (Array.isArray(candidate.output)) return candidate.output.flatMap((item) => item.content || []).map((content) => content?.text || '').join('');
    }

    if (Array.isArray(data.output)) return data.output.flatMap((item) => item.content || []).map((content) => content?.text || '').join('');
    if (Array.isArray(data.responses)) return data.responses.flatMap((response) => response.content || []).map((content) => content?.text || '').join('');
    if (Array.isArray(data.data)) return data.data.flatMap((item) => item.content || []).map((content) => content?.text || '').join('');

    return null;
  }

  async function requestGemini(apiUrl, headers) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(requestBody),
      });

      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok) {
        const message = data?.error?.message || data?.error?.status || text || `Gemini request failed with status ${response.status}`;
        return { ok: false, status: response.status, message, data };
      }

      const answer = extractGeminiText(data);
      return { ok: true, answer, data };
    } catch (err) {
      return { ok: false, status: 0, message: err.message || 'Gemini request failed.' };
    }
  }

  if (GEMINI_API_KEY) {
    const useBearer = isBearerTokenLike(GEMINI_API_KEY);
    const useApiKey = isApiKeyLike(GEMINI_API_KEY);
    const candidateUrls = [];
    const apiHeaders = {};

    if (useBearer || !useApiKey) {
      apiHeaders.Authorization = `Bearer ${GEMINI_API_KEY}`;
      candidateUrls.push(generateUrl, generateContentUrl);
    }

    if (useApiKey) {
      candidateUrls.push(
        `${generateUrl}?key=${GEMINI_API_KEY}`,
        `${generateContentUrl}?key=${GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1/${modelPath}:generate?key=${GEMINI_API_KEY}`,
        `https://generativelanguage.googleapis.com/v1beta2/${modelPath}:generate?key=${GEMINI_API_KEY}`,
      );
    }

    if (!useBearer && !useApiKey) {
      apiHeaders.Authorization = `Bearer ${GEMINI_API_KEY}`;
      candidateUrls.push(generateUrl, generateContentUrl);
    }

    let lastError = null;
    const tried = new Set();
    for (const apiUrl of candidateUrls) {
      if (!apiUrl || tried.has(apiUrl)) continue;
      tried.add(apiUrl);

      const result = await requestGemini(apiUrl, apiHeaders);
      if (result.ok) {
        return { answer: result.answer, error: null };
      }
      lastError = result.message;
    }

    return { answer: null, error: `Gemini request failed using configured key/token. Last error: ${lastError}` };
  }

  let authHeader = null;
  try {
    const { JWT, GoogleAuth } = require('google-auth-library');
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const sa = require(serviceAccountPath);
        if (sa && sa.client_email && sa.private_key) {
          const jwtClient = new JWT({
            email: sa.client_email,
            key: sa.private_key,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });
          const r = await jwtClient.authorize();
          const token = r && (r.access_token || r.token);
          if (token) authHeader = `Bearer ${token}`;
        }
      } catch (e) {
        // fall through to ADC
      }
    }

    if (!authHeader) {
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const client = await auth.getClient();
      const at = await client.getAccessToken();
      const token = at && typeof at === 'object' ? at.token || at.access_token : at;
      if (token) authHeader = `Bearer ${token}`;
    }
  } catch (err) {
    // ignore — we'll try API key fallback below
  }

  if (authHeader) {
    const authResult = await requestGemini(generateUrl, { Authorization: authHeader });
    if (authResult.ok) return { answer: authResult.answer, error: null };
    const altAuthResult = await requestGemini(generateContentUrl, { Authorization: authHeader });
    if (altAuthResult.ok) return { answer: altAuthResult.answer, error: null };
    return { answer: null, error: authResult.message || altAuthResult.message || 'Gemini OAuth request failed.' };
  }

  return { answer: null, error: 'Gemini API key or service account credentials are not configured.' };
}

async function callOpenAIModel(query, contextText) {
  if (!OPENAI_API_KEY) {
    return { answer: null, error: 'OpenAI API key is not configured.' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a business analyst assistant. Answer the user question naturally and precisely using the provided Firestore context. If the context does not contain enough information, say so clearly.',
          },
          {
            role: 'user',
            content: `Context:\n${contextText}\n\nQuestion:\n${query}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || `OpenAI request failed with status ${response.status}`;
      return { answer: null, error: message };
    }

    return { answer: data?.choices?.[0]?.message?.content || null, error: null };
  } catch (err) {
    console.warn('OpenAI model is not available:', err.message);
    return { answer: null, error: err.message || 'OpenAI request failed.' };
  }
}

async function callGitHubModels(query, contextText) {
  if (!GITHUB_TOKEN) {
    return { answer: null, error: 'GitHub Models token is not configured.' };
  }

  try {
    const response = await fetch(`${GITHUB_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
      },
      body: JSON.stringify({
        model: GITHUB_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a business data analyst. Use the context below to answer the user question concisely and mention records when possible.',
          },
          {
            role: 'user',
            content: `Context:\n${contextText}\n\nQuestion:\n${query}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || `GitHub Models request failed with status ${response.status}`;
      return { answer: null, error: message };
    }

    return { answer: data?.choices?.[0]?.message?.content || null, error: null };
  } catch (err) {
    console.warn('GitHub Models is not available:', err.message);
    return { answer: null, error: err.message || 'GitHub Models request failed.' };
  }
}

async function callLLM(query, contextText) {
  if (GEMINI_API_KEY) {
    const geminiResult = await callGeminiModel(query, contextText);
    if (geminiResult.answer) {
      return { answer: geminiResult.answer, source: 'gemini', error: null };
    }
    return { answer: null, source: 'gemini', error: geminiResult.error || 'Gemini request failed.' };
  }

  return { answer: null, source: null, error: 'Gemini API key is not configured.' };
}

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    mode: GEMINI_API_KEY ? 'gemini' : 'offline',
    gemini: !!GEMINI_API_KEY,
    geminiModel: GEMINI_MODEL,
    time: new Date().toISOString(),
  })
);

app.post('/api/rag/index', async (req, res) => {
  try {
    const docsToIndex = await getDocumentsForIndexing();
    return res.json({ ok: true, indexed: docsToIndex.length, mode: 'local', source: db ? 'firestore' : 'offline' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/rag/query', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const matches = await retrieveLocalMatches(query, topK);
    const contextText = matches.map((match) => `${match.metadata.collection} ${match.metadata.id}: ${match.text}`).join('\n');

    const promptContext = contextText || 'No matching Firestore records were found. Answer the user generally and mention that the data connection did not return records.';
    const { answer: llmAnswer, source: llmSource, error: llmError } = await callLLM(query, promptContext);
    if (llmAnswer) {
      return res.json({ answer: llmAnswer, matches, mode: 'gemini', source: llmSource });
    }

    const answer = getFallbackReply(query, matches);
    res.json({ answer, matches, mode: 'fallback', error: llmError });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Simple Gemini generation endpoint (no RAG) for testing and direct prompts
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { query, model } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query is required' });

    // Use existing GEMINI_MODEL unless overridden
    const prevModel = process.env.GEMINI_MODEL;
    if (model) process.env.GEMINI_MODEL = model;

    const result = await callGeminiModel(query, '');

    // restore model env if we overwrote it
    if (model) process.env.GEMINI_MODEL = prevModel;

    if (result.answer) return res.json({ answer: result.answer, error: null });
    return res.status(500).json({ answer: null, error: result.error || 'Generation failed' });
  } catch (err) {
    console.error('gemini generate error', err.message);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(PORT, () => console.log(`RAG server listening on ${PORT}`));
