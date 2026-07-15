#!/usr/bin/env node
// Incrementa a versão do Hub: X.Y → X.(Y+1), e quando Y=9 → (X+1).0
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_PATH  = path.join(ROOT, 'package.json');
const HTML_PATH = path.join(ROOT, 'index.html');

// Lê versão atual
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
const [major, minor] = pkg.version.split('.').map(Number);

// Calcula próxima versão
const newMinor = minor >= 9 ? 0 : minor + 1;
const newMajor = minor >= 9 ? major + 1 : major;
const oldVer = `${major}.${minor}`;
const newVer = `${newMajor}.${newMinor}`;

// Atualiza package.json
pkg.version = `${newVer}.0`;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

// Atualiza todas as ocorrências no HTML
let html = fs.readFileSync(HTML_PATH, 'utf-8');
html = html.replaceAll(`v${oldVer}`, `v${newVer}`);
fs.writeFileSync(HTML_PATH, html);

console.log(`Versão: v${oldVer} → v${newVer}`);
