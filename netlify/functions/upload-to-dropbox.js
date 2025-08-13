const Busboy = require('busboy');
const fetch = require('node-fetch');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) return { statusCode: 500, body: 'Missing DROPBOX_ACCESS_TOKEN' };

  const contentType = event.headers['content-type'] || event.headers['Content-Type'];
  if (!contentType || !contentType.includes('multipart/form-data')) return { statusCode: 400, body: 'Expected multipart/form-data' };

  const busboy = Busboy({ headers: { 'content-type': contentType } });
  const chunks = [];
  let filename = 'upload.bin';
  let dealName = 'swiftpath';

  const done = new Promise((resolve, reject) => {
    busboy.on('file', (fieldname, file, info) => {
      filename = info.filename || filename;
      file.on('data', data => chunks.push(data));
      file.on('limit', () => reject(new Error('File too large')));
    });
    busboy.on('field', (name, val) => { if (name === 'dealName') dealName = val; });
    busboy.on('error', reject);
    busboy.on('finish', resolve);
  });

  const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
  busboy.end(body);
  await done;

  const buffer = Buffer.concat(chunks);
  if (!buffer.length) return { statusCode: 400, body: 'No file received' };

  const now = new Date();
  const folder = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const safeDeal = dealName.replace(/[^a-z0-9 _.-]/gi,'_').slice(0,120);
  const path = `/${folder}/${safeDeal}/${filename}`;

  const up = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: false }),
      'Content-Type': 'application/octet-stream'
    },
    body: buffer
  });
  if (!up.ok) return { statusCode: 502, body: 'Dropbox upload failed: '+await up.text() };

  let url = '';
  const share = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ path })
  });
  if (share.ok) {
    const d = await share.json(); url = (d.url||'').replace('?dl=0','?dl=1');
  } else if (share.status === 409) {
    const list = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method:'POST', headers:{ 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ path })
    });
    const l = await list.json(); url = (l.links && l.links[0] && l.links[0].url || '').replace('?dl=0','?dl=1');
  } else {
    return { statusCode: 502, body: 'Dropbox share failed: '+await share.text() };
  }

  return { statusCode: 200, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ url }) };
};
