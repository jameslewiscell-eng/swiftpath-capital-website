// netlify/functions/upload-to-dropbox.js
// Handles multipart form uploads and saves files to Dropbox App Folder.
// Requires env var: DROPBOX_ACCESS_TOKEN (set in Netlify UI).
// Uses Node 18's global fetch (no node-fetch import).

const Busboy = require('busboy');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Missing DROPBOX_ACCESS_TOKEN' })
    };
  }

  try {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: 'Content-Type must be multipart/form-data' })
      };
    }

    const busboy = Busboy({ headers: { 'content-type': contentType } });

    const fields = {};
    const files = [];
    let totalBytes = 0;
    const MAX_BYTES = 50 * 1024 * 1024; // 50MB safety limit per request

    const parsePromise = new Promise((resolve, reject) => {
      busboy.on('file', (name, file, info) => {
        const { filename, mimeType } = info || {};
        const chunks = [];
        file.on('data', (data) => {
          totalBytes += data.length;
          if (totalBytes > MAX_BYTES) {
            file.unpipe();
            reject(new Error('Upload too large (limit 50MB)'));
            return;
          }
          chunks.push(data);
        });
        file.on('limit', () => reject(new Error('File size limit reached')));
        file.on('end', () => {
          files.push({
            fieldname: name,
            filename: filename || 'unnamed',
            mimeType: mimeType || 'application/octet-stream',
            buffer: Buffer.concat(chunks)
          });
        });
      });

      busboy.on('field', (name, val) => {
        fields[name] = val;
      });

      busboy.on('error', reject);
      busboy.on('finish', resolve);
    });

    const bodyBuffer = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    busboy.end(bodyBuffer);
    await parsePromise;

    if (files.length === 0) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: 'No files found in upload' })
      };
    }

    const results = [];
    for (const f of files) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dropboxPath = `/${timestamp}__${f.filename}`;

      // Upload file bytes
      const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({
            path: dropboxPath,
            mode: 'add',
            autorename: true,
            mute: false,
            strict_conflict: false
          }),
          'Content-Type': 'application/octet-stream'
        },
        body: f.buffer
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Dropbox upload failed: ${uploadRes.status} ${text}`);
      }

      const uploaded = await uploadRes.json();

      // Create or retrieve a shared link
      let sharedUrl = null;
      const shareRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: uploaded.path_lower })
      });

      if (shareRes.ok) {
        const shareData = await shareRes.json();
        sharedUrl = shareData && shareData.url ? shareData.url.replace('?dl=0', '?dl=1') : null;
      } else {
        const listRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path: uploaded.path_lower, direct_only: true })
        });
        if (listRes.ok) {
          const list = await listRes.json();
          if (list && list.links && list.links[0] && list.links[0].url) {
            sharedUrl = list.links[0].url.replace('?dl=0', '?dl=1');
          }
        }
      }

      results.push({
        field: f.fieldname,
        filename: f.filename,
        dropbox_path: uploaded.path_lower,
        size: f.buffer.length,
        url: sharedUrl
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ ok: true, files: results, fields })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message || String(err) })
    };
  }
};