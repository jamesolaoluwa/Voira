#!/usr/bin/env node
// Lightweight build artifact scanner for CI
// Fails if sensitive patterns (admin_emails, admin-like emails, or Supabase service role keys) are found.

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const distDir = path.resolve(root, 'dist');

function walk(dir, cb) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp, cb);
    else cb(fp);
  });
}

// Patterns (case-insensitive)
const patterns = [
  { name: 'admin_emails', re: /admin_emails/i },
  // generic email-like matches for admin or example domains; tweakable
  { name: 'suspicious_email', re: /@[A-Za-z0-9._%+-]*(?:admin|test)[A-Za-z0-9._%+-]*\.[A-Za-z]{2,}/i },
  { name: 'suspicious_email_simple', re: /@admin\b/i },
];

// Supabase service role pattern: detect JWT-like long tokens starting with 'eyJ'.
// To avoid false-positives on the anon key, ignore the public anon key from the
// environment (CI injects VITE_SUPABASE_ANON_KEY at build time) and from repo .env files.
const serviceRoleRe = /eyJ[A-Za-z0-9._-]{80,}/i; // heuristic: long JWT-like token

// Collect anon keys to whitelist them in the scan
const anonKeys = new Set();
if (process.env.VITE_SUPABASE_ANON_KEY) {
  anonKeys.add(process.env.VITE_SUPABASE_ANON_KEY.trim());
}
const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
envFiles.forEach(f => {
  const p = path.resolve(root, f);
  if (!fs.existsSync(p)) return;
  try {
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    lines.forEach(l => {
      const m = l.match(/^\s*VITE_SUPABASE_ANON_KEY\s*=\s*(.+)\s*$/i);
      if (m && m[1]) anonKeys.add(stripQuotes(m[1].trim()));
    });
  } catch {
    // Ignore errors reading .env files
  }
});

// Helper to strip surrounding quotes
function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

let failures = [];

if (!fs.existsSync(distDir)) {
  console.log('No dist/ directory found — skipping build scan (pass).');
  process.exit(0);
}

walk(distDir, (file) => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    patterns.forEach(p => {
      if (p.re.test(content)) failures.push({ file, match: p.name, snippet: firstMatchSnippet(content, p.re) });
    });
    const sr = content.match(serviceRoleRe);
    if (sr && sr[0]) {
      const token = sr[0];
      if (!anonKeys.has(token)) {
        failures.push({ file, match: 'supabase_service_role_key', snippet: firstMatchSnippet(content, serviceRoleRe) });
      }
    }
  } catch {
    // ignore binary files
  }
});

if (failures.length > 0) {
  console.error('\nCI security scan failed: detected sensitive patterns in build output.');
  failures.forEach(f => {
    console.error(`\n- ${f.match} in ${f.file}`);
    console.error(`  snippet: ...${f.snippet}...`);
  });
  process.exit(2);
}

console.log('CI security scan passed (no sensitive patterns found in dist/).');
process.exit(0);

function firstMatchSnippet(content, re) {
  const m = content.match(re);
  if (!m) return '';
  const idx = content.indexOf(m[0]);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + m[0].length + 40);
  return content.slice(start, end).replace(/\s+/g, ' ');
}
